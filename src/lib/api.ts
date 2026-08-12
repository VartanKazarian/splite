/**
 * Cliente HTTP de Splite — sigue docs/FRONTEND_BRIEF.md al pie de la letra.
 *
 * Reglas del contrato:
 *  - El dinero viaja como string de dígitos en unidades menores. Nunca se hace
 *    aritmética en el cliente: sólo se formatea (`formatMinor`).
 *  - Los errores siempre tienen { error: { code, message, details, requestId } }
 *    y se ramifica por `code`, jamás por `message`.
 *  - Staff: Bearer accessToken; refresh es rotativo y single-flight.
 *  - Guest: SIEMPRE dos cabeceras (Authorization + X-Guest-Session).
 */

export const API_BASE_URL: string =
  import.meta.env['VITE_API_BASE_URL'] ?? "https://splite-backend-production.up.railway.app";

/** "1893852" -> "18.938,52" (agrupación venezolana). Pura manipulación de strings. */
export function formatMinor(minor: string): string {
  const negative = minor.startsWith("-");
  const digits = (negative ? minor.slice(1) : minor).padStart(3, "0");
  const whole = digits.slice(0, -2);
  const cents = digits.slice(-2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${cents}`;
}

export type ApiErrorBody = {
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly requestId: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? {};
    this.requestId = body.requestId;
  }
}

export type StaffSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; role: StaffRole; restaurantId: string };
};

export type StaffRole = "OWNER" | "MANAGER" | "CASHIER" | "WAITER";

export type GuestSession = {
  sessionId: string;
  guestToken: string;
  restaurantId: string;
  tableId: string;
  expiresIn: number;
};

const STAFF_KEY = "splite.staff.session";
const GUEST_KEY = "splite.guest.session";

function readStore<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown | null) {
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(value));
}

export const staffSession = {
  get: () => readStore<StaffSession>(STAFF_KEY),
  set: (s: StaffSession | null) => writeStore(STAFF_KEY, s),
};

export const guestSession = {
  get: () => readStore<GuestSession>(GUEST_KEY),
  set: (s: GuestSession | null) => writeStore(GUEST_KEY, s),
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: "none" | "staff" | "guest";
  /** interno: evita bucles de refresh */
  retryOnUnauthorized?: boolean;
};

async function rawRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  if (opts.auth === "staff") {
    const s = staffSession.get();
    if (s) headers["Authorization"] = `Bearer ${s.accessToken}`;
  } else if (opts.auth === "guest") {
    const g = guestSession.get();
    if (g) {
      // Las dos cabeceras siempre juntas: mandar sólo una es 401.
      headers["Authorization"] = `Bearer ${g.guestToken}`;
      headers["X-Guest-Session"] = g.sessionId;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { error?: ApiErrorBody }
    | T
    | null;

  if (!response.ok) {
    const body = (payload as { error?: ApiErrorBody } | null)?.error ?? {
      code: "UNKNOWN_ERROR",
      message: `Request failed with status ${response.status}`,
      details: {},
      requestId: "",
    };
    throw new ApiError(response.status, body);
  }

  return payload as T;
}

/** Refresh rotativo: una sola llamada en vuelo, compartida por todos. */
let refreshInFlight: Promise<StaffSession> | null = null;

async function refreshOnce(): Promise<StaffSession> {
  refreshInFlight ??= (async () => {
    const current = staffSession.get();
    if (!current) throw new ApiError(401, {
      code: "AUTH_TOKEN_INVALID",
      message: "No session",
      details: {},
      requestId: "",
    });
    const next = await rawRequest<StaffSession>("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken: current.refreshToken },
    });
    staffSession.set(next);
    return next;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, opts);
  } catch (error) {
    const canRetry =
      error instanceof ApiError &&
      error.status === 401 &&
      opts.auth === "staff" &&
      opts.retryOnUnauthorized !== false;
    if (!canRetry) throw error;

    try {
      await refreshOnce();
    } catch {
      staffSession.set(null);
      throw error;
    }
    return rawRequest<T>(path, { ...opts, retryOnUnauthorized: false });
  }
}

/* ---------------------------------------------------------------- staff */

export const auth = {
  login: (email: string, password: string) =>
    apiRequest<StaffSession>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    }).then((session) => {
      staffSession.set(session);
      return session;
    }),

  /** En cada arranque: /auth/me, nunca /auth/refresh para saber quién es. */
  me: () => apiRequest<{ user: StaffSession["user"] }>("/api/v1/auth/me", { auth: "staff" }),

  logout: async () => {
    const s = staffSession.get();
    staffSession.set(null);
    if (!s) return;
    await rawRequest<void>("/api/v1/auth/logout", {
      method: "POST",
      body: { refreshToken: s.refreshToken },
    }).catch(() => undefined);
  },
};

/* ---------------------------------------------------------------- guest */

export const guest = {
  openSession: (qrToken: string) =>
    apiRequest<GuestSession>("/api/v1/guest/sessions", {
      method: "POST",
      body: { qrToken },
    }).then((session) => {
      guestSession.set(session);
      return session;
    }),

  /** 404 OPEN_BILL_NOT_FOUND es el estado normal entre servicios, no un error. */
  bill: <T = unknown>() => apiRequest<T>("/api/v1/guest/bill", { auth: "guest" }),

  splitPreview: <T = unknown>(body: unknown) =>
    apiRequest<T>("/api/v1/guest/bill/split/preview", {
      method: "POST",
      body,
      auth: "guest",
    }),

  endSession: async () => {
    await apiRequest<void>("/api/v1/guest/sessions", { method: "DELETE", auth: "guest" }).catch(
      () => undefined,
    );
    guestSession.set(null);
  },
};
