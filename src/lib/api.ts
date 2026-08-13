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

/**
 * "1.250,50" -> "125050". Sólo manipulación de strings: nada de parseFloat ni
 * multiplicar por 100 en coma flotante (un float aquí desvía cada precio).
 */
export function parseMinorInput(input: string): string {
  const cleaned = input.trim().replace(/[^\d.,]/g, "");
  if (!cleaned) return "";
  // El último separador con 1-2 dígitos detrás es el decimal; el resto son miles.
  const match = cleaned.match(/^(.*?)([.,](\d{1,2}))?$/);
  const decimals = match?.[3] ?? "";
  const wholeRaw = (match?.[3] !== undefined ? (match?.[1] ?? "") : cleaned).replace(/\D/g, "");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "");
  const cents = decimals.padEnd(2, "0");
  const digits = `${whole || "0"}${cents}`.replace(/^0+(?=\d)/, "");
  return digits === "" ? "0" : digits;
}

/**
 * Porcentaje escrito por el usuario → basis points (entero 0..10000).
 * Aritmética sobre dígitos, nunca coma flotante: "12,5" → "12" + "50" = 1250.
 */
export function parseBpsInput(input: string): number {
  const cleaned = input.trim().replace(/[^\d.,]/g, "");
  if (!cleaned) return NaN;
  const [wholeRaw = "", fracRaw = ""] = cleaned.split(/[.,]/);
  const whole = wholeRaw.replace(/\D/g, "") || "0";
  const frac = fracRaw.replace(/\D/g, "").slice(0, 2).padEnd(2, "0");
  return Number(`${whole}${frac}`.replace(/^0+(?=\d)/, ""));
}

/** 1600 → "16%", 1250 → "12,5%" */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = String(Math.abs(bps) % 100).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${frac ? `,${frac}` : ""}%`;
}

export function currencySymbol(currency: MenuCurrency): string {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return "Bs";
}

/** Formatea un monto en unidades menores con el símbolo correcto de la moneda. */
export function formatMoney(minor: string, currency: MenuCurrency): string {
  const symbol = currencySymbol(currency);
  const amount = formatMinor(minor);
  return currency === "VES" ? `${amount} ${symbol}` : `${symbol}${amount}`;
}

/** "771.07140000" → "771,0714". No aritmética: sólo recorta ceros decimales. */
export function formatFxRate(rate: string): string {
  const [wholeRaw, fracRaw = ""] = rate.split(".");
  const whole = (wholeRaw || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = fracRaw.replace(/0+$/, "");
  return frac ? `${whole},${frac}` : whole;
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

/** details.fields dice exactamente qué campo falló; sin esto un 400 parece un fallo genérico. */
export function errorFields(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const raw = (error.details as { fields?: unknown })?.fields;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.join(", ") : String(v),
    ]),
  );
}

/** Texto corto listo para toast: "limit: must be <= 100". */
export function errorFieldsText(error: unknown): string {
  return Object.entries(errorFields(error))
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
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
  get: (): GuestSession | null => {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GuestSession;
    } catch {
      return null;
    }
  },
  set: (s: GuestSession | null) => {
    if (typeof window === "undefined") return;
    if (s === null) window.sessionStorage.removeItem(GUEST_KEY);
    else window.sessionStorage.setItem(GUEST_KEY, JSON.stringify(s));
  },
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

/* ------------------------------------------------------- tipos de dominio */

export type Money = string; // dígitos en unidades menores
export type MenuCurrency = "VES" | "USD" | "EUR";

export type Table = {
  id: string;
  restaurantId: string;
  name: string;
  active: boolean;
  createdAt: string;
};

export type BillItem = {
  id: string;
  billId: string;
  productId: string | null;
  name: string;
  unitPriceMinor: Money;
  currency: MenuCurrency;
  quantity: number;
  subtotalMinor: Money;
};

export type Bill = {
  id: string;
  tableId: string;
  status: "OPEN" | "CLOSED" | "VOID";
  currency: MenuCurrency;
  subtotalMinor: Money;
  vatBps: number;
  vatMinor: Money;
  serviceChargeBps: number;
  serviceChargeMinor: Money;
  totalDue: Money;
  totalDueVes: Money;
  amountPaidVes: Money;
  remainingVes: Money;
  /** El backend lo llama fxRateVesPerUnit; se acepta el alias corto por compatibilidad. */
  fxRateVesPerUnit?: string | null;
  fxRate?: string | null;
  fxValueDate?: string | null;
  usdReference?: string | null;
  itemCount?: number;
  items?: BillItem[];
};

export type SplitMode = "FULL" | "EQUAL" | "ITEMS" | "CUSTOM";

export type SplitPreviewRequest = {
  mode: SplitMode;
  participants: { id: string; name?: string; amountVes?: Money }[];
  claims?: { itemId: string; participantIds: string[] }[];
};

export type SplitPreview = {
  mode: SplitMode;
  currency: "VES";
  outstandingVes: Money;
  totalAllocatedVes: Money;
  allocations: {
    participantId: string;
    name: string | null;
    amountVes: Money;
    usdReference: string | null;
  }[];
};

export type ExchangeRate = {
  rates: Record<string, { rate: string; valueDate: string | null; source: string }>;
};

export type PaymentResult = {
  paymentId: string;
  status: "OPEN" | "CLOSED";
  totalDue: Money;
  amountPaid: Money;
  remaining: Money;
};

/* ------------------------------------------------------- endpoints staff */

export type Product = {
  id: string;
  name: string;
  description: string | null;
  priceMinorUnits: Money;
  currency: MenuCurrency;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MenuSettings = {
  id: string;
  name: string;
  menuCurrency: MenuCurrency;
  vatBps: number;
  serviceChargeBps: number;
  /** Sólo lo devuelve PATCH /charges: cuentas abiertas que conservan las tarifas viejas. */
  openBillsUnaffected?: number;
};

export type FloorTable = Table & { openBill: Bill | null };

/** El backend limita cualquier listado a 100 por página. Nunca pedir más. */
export const PAGE_LIMIT = 100;

/** Recorre páginas de 100 en 100 hasta agotar el listado. */
async function listAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await apiRequest<{ data: T[] }>(
      `${path}${sep}limit=${PAGE_LIMIT}&offset=${offset}`,
      { auth: "staff" },
    );
    const batch = res.data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }
  return out;
}

export const tables = {
  list: () => listAll<Table>("/api/v1/tables"),

  /** Un solo GET con todas las mesas: openBill = null significa mesa libre, no error. */
  floor: () =>
    apiRequest<{ data: FloorTable[] } | FloorTable[]>("/api/v1/tables/floor", {
      auth: "staff",
    }).then((r) => (Array.isArray(r) ? r : r.data)),
  create: (name: string) =>
    apiRequest<Table>("/api/v1/tables", { method: "POST", auth: "staff", body: { name } }),
  rename: (tableId: string, name: string) =>
    apiRequest<Table>(`/api/v1/tables/${tableId}`, { method: "PATCH", auth: "staff", body: { name } }),
  /** No hay DELETE: eliminar una mesa es desactivarla (PATCH active:false). */
  deactivate: (tableId: string) =>
    apiRequest<Table>(`/api/v1/tables/${tableId}`, {
      method: "PATCH",
      auth: "staff",
      body: { active: false },
    }),
  update: (tableId: string, body: { name?: string; active?: boolean }) =>
    apiRequest<Table>(`/api/v1/tables/${tableId}`, { method: "PATCH", auth: "staff", body }),
  openBill: (tableId: string) =>
    apiRequest<Bill>(`/api/v1/bills/tables/${tableId}/open`, { auth: "staff" }),
  qrToken: (tableId: string) =>
    apiRequest<{ token: string; expiresIn: number }>(`/api/v1/guest/tables/${tableId}/qr`, {
      auth: "staff",
    }),
  rotateQr: (tableId: string) =>
    apiRequest<{ token: string; expiresIn: number }>(
      `/api/v1/guest/tables/${tableId}/qr/rotate`,
      { method: "POST", auth: "staff" },
    ),
};

/** Menú del restaurante: la moneda la fija el restaurante, nunca la petición. */
export const menu = {
  settings: () => apiRequest<MenuSettings>("/api/v1/menu/settings", { auth: "staff" }),
  /** El backend espera { currency }, no { menuCurrency }: enviarlo mal da VALIDATION_FAILED. */
  setCurrency: (currency: MenuCurrency) =>
    apiRequest<MenuSettings>("/api/v1/menu/settings/currency", {
      method: "PATCH",
      auth: "staff",
      body: { currency },
    }),
  /** Tarifas en basis points (0..10000). Se envía al menos una. */
  setCharges: (body: { vatBps?: number; serviceChargeBps?: number }) =>
    apiRequest<MenuSettings>("/api/v1/menu/settings/charges", {
      method: "PATCH",
      auth: "staff",
      body,
    }),
  products: () => listAll<Product>("/api/v1/menu/products"),

  createProduct: (body: { name: string; priceMinorUnits: Money; description?: string | null }) =>
    apiRequest<Product>("/api/v1/menu/products", { method: "POST", auth: "staff", body }),
  updateProduct: (
    id: string,
    body: { name?: string; priceMinorUnits?: Money; description?: string | null; active?: boolean },
  ) => apiRequest<Product>(`/api/v1/menu/products/${id}`, { method: "PATCH", auth: "staff", body }),
  /** Sin `permanent` sólo desactiva; con `permanent` borra (las cuentas guardan su snapshot). */
  deleteProduct: (id: string, permanent = false) =>
    apiRequest<void>(
      `/api/v1/menu/products/${id}${permanent ? "?permanent=true" : ""}`,
      { method: "DELETE", auth: "staff" },
    ),
};


export const bills = {
  get: (id: string) => apiRequest<Bill>(`/api/v1/bills/${id}`, { auth: "staff" }),
  /** Abrir con total 0 es lo que permite luego añadir líneas del menú. */
  open: (tableId: string, totalDueMinorUnits: Money = "0") =>
    apiRequest<Bill>("/api/v1/bills", {
      method: "POST",
      auth: "staff",
      body: { tableId, totalDueMinorUnits },
    }),
  /** Cerrar una cuenta abierta sin pagos: el backend la anula (VOID) y libera la mesa. */
  void: (id: string) =>
    apiRequest<Bill>(`/api/v1/bills/${id}/void`, { method: "POST", auth: "staff" }),
  items: (id: string) =>
    apiRequest<{ data: BillItem[] }>(`/api/v1/bills/${id}/items`, { auth: "staff" }).then(
      (r) => r.data,
    ),
  addItem: (id: string, productId: string, quantity = 1) =>
    apiRequest<{ item: BillItem; bill: Bill }>(`/api/v1/bills/${id}/items`, {
      method: "POST",
      auth: "staff",
      body: { productId, quantity },
    }),
  updateItem: (id: string, itemId: string, quantity: number) =>
    apiRequest<{ item: BillItem; bill: Bill }>(`/api/v1/bills/${id}/items/${itemId}`, {
      method: "PATCH",
      auth: "staff",
      body: { quantity },
    }),
  removeItem: (id: string, itemId: string) =>
    apiRequest<{ bill: Bill }>(`/api/v1/bills/${id}/items/${itemId}`, {
      method: "DELETE",
      auth: "staff",
    }),

  splitPreview: (id: string, body: SplitPreviewRequest) =>
    apiRequest<SplitPreview>(`/api/v1/bills/${id}/split/preview`, {
      method: "POST",
      body,
      auth: "staff",
    }),
  /** La clave de idempotencia se genera una vez por intento y se reutiliza en cada reintento. */
  pay: (id: string, amountMinorUnits: Money, idempotencyKey: string) =>
    apiRequest<PaymentResult>(`/api/v1/bills/${id}/payments`, {
      method: "POST",
      auth: "staff",
      headers: { "Idempotency-Key": idempotencyKey },
      body: { billId: id, amountMinorUnits, currency: "VES", idempotencyKey },
    }),
};

/** Requiere sesión de personal: sin Bearer devuelve AUTH_TOKEN_MISSING. */
export const exchangeRate = () =>
  apiRequest<ExchangeRate>("/api/v1/exchange-rate", { auth: "staff" });


export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `key-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
