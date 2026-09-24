/**
 * Cliente HTTP de Splite.
 *
 * Las convenciones que sigue -- dinero en unidades menores y en cadena, nunca
 * aritmética aquí, todo importe calculado por el servidor -- están escritas en
 * `docs/FRONTEND_BRIEF.md` **del backend**, que es donde se mantienen junto al
 * código que las cumple. Aquí había una copia de ese documento y del contrato
 * `openapi.json`: las dos se quedaron atrás -- el contrato con 56 de las 98
 * rutas, el brief diciendo que un comensal todavía no puede pagar -- y no las
 * leía nadie, porque los tipos de este fichero están escritos a mano. Una copia
 * desactualizada que afirma estar verificada es peor que no tenerla.
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
  import.meta.env["VITE_API_BASE_URL"] ?? "https://splite-backend-production.up.railway.app";

/**
 * De dónde cuelgan los enlaces que se imprimen en un QR de mesa.
 *
 * Estaba escrito a mano como "https://splite.lovable.app" dentro del panel, así
 * que el código impreso apuntaba ahí pasara lo que pasara: en local se imprimían
 * QRs que mandaban a producción, y el día que el panel viva en otro dominio los
 * códigos ya pegados en las mesas seguirían llevando al de antes.
 *
 * Por defecto, el origen desde el que se está mirando el panel: el comensal
 * acaba en la misma app. `VITE_GUEST_BASE_URL` lo fija cuando hacen falta
 * códigos canónicos desde un despliegue de vista previa -- ahí el origen es una
 * URL temporal, y un QR impreso con ella deja de funcionar cuando caduca.
 */
export const GUEST_BASE_URL: string =
  import.meta.env["VITE_GUEST_BASE_URL"] ??
  (typeof window === "undefined" ? "" : window.location.origin);

/**
 * Si el enlace que se va a imprimir vive en un dominio que va a caducar.
 *
 * Los despliegues de vista previa de Lovable cuelgan de un host temporal.
 * Imprimir un QR desde ahí produce un código que funciona hoy y deja de
 * resolver cuando la vista previa rota, y el fallo aparece semanas después,
 * en la mesa, sin nada que lo explique. Fijar `VITE_GUEST_BASE_URL` lo
 * resuelve; mientras no esté, al menos se avisa antes de imprimir.
 */
export function isEphemeralGuestHost(): boolean {
  if (import.meta.env["VITE_GUEST_BASE_URL"]) return false;
  if (!GUEST_BASE_URL) return false;
  return /(^|\/\/)[^/]*id-preview--|\.lovableproject\.com/.test(GUEST_BASE_URL);
}

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
  const frac = String(Math.abs(bps) % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
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

/**
 * "1234.56" → "$1.234,56".
 *
 * El servidor manda la referencia en dólares como un decimal en unidades
 * mayores y con punto: convención de máquina. Todo lo demás en este fichero
 * habla en unidades menores y se imprime a la venezolana -- punto para los
 * miles, coma para los céntimos --, así que esto se convierte antes de pasar
 * por el formateador de siempre. Imprimirlo tal cual ponía "≈ $40.32" al lado
 * de "30.544,04 Bs": dos convenciones de puntuación en la misma línea, y el
 * punto significando dos cosas distintas a cinco centímetros.
 *
 * Sin aritmética de coma flotante, como el resto: se recorta la cadena.
 */
export function formatDecimalMoney(value: string, currency: MenuCurrency): string {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const [wholeRaw = "", fracRaw = ""] = trimmed.replace(/^[-+]/, "").split(".");
  const whole = wholeRaw.replace(/\D/g, "") || "0";
  const cents = fracRaw.replace(/\D/g, "").slice(0, 2).padEnd(2, "0");
  return formatMoney(`${negative ? "-" : ""}${whole}${cents}`, currency);
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
  user: {
    id: string;
    email: string;
    role: StaffRole;
    restaurantId: string;
    /** Cómo se llama, cuando lo ha dicho. Null mientras no. */
    displayName?: string | null;
  };
};

export type StaffRole = "OWNER" | "MANAGER" | "CASHIER" | "WAITER";

/** Quién puede hacer qué a quién: mayor manda sobre menor, y nunca sobre su igual. */
export const STAFF_RANK: Record<StaffRole, number> = {
  OWNER: 4,
  MANAGER: 3,
  CASHIER: 2,
  WAITER: 1,
};

export type StaffMember = {
  id: string;
  email: string;
  /**
   * Cómo quiere que le llamen, si se lo ha puesto.
   *
   * `null` a propósito y no el correo: el servidor no sustituye, así que quien
   * enseña esto decide qué poner mientras tanto. Opcional además de anulable
   * porque un backend anterior a este campo simplemente no lo manda.
   */
  displayName?: string | null;
  role: StaffRole;
  active: boolean;
  restaurantId: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GuestSession = {
  sessionId: string;
  guestToken: string;
  restaurantId: string;
  tableId: string;
  expiresIn: number;
};

/**
 * Lo que devuelve un QR escaneado antes de decidir nada.
 *
 * `hasOpenBill` es lo único que dice del dinero: si ofrecer la cuenta o no.
 * Cuánto se debe queda detrás de la sesión.
 */
/**
 * La cara del restaurante: la portada y el logo.
 *
 * Se usan tal cual vienen, con su sufijo `?v=`: cambia cuando cambia la imagen,
 * y es lo único que impide que un móvil siga enseñando la portada anterior.
 * `null` es lo normal -- casi ningún restaurante sube nada el primer día -- y
 * tiene que verse deliberado, no roto.
 */
export type Branding = { coverUrl: string | null; logoUrl: string | null };

export type BrandingKind = "COVER" | "LOGO";

export type QrContext = {
  restaurant: { id: string; name: string; menuCurrency: MenuCurrency } & Branding;
  table: { id: string; name: string };
  hasOpenBill: boolean;
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

const QR_KEY = "splite.guest.qr";

/**
 * El token del QR mientras dure la pestaña.
 *
 * La pantalla de mesa lo borra de la barra de direcciones en cuanto lo lee -- no
 * debe quedar en la URL ni en una captura -- pero sigue haciendo falta después:
 * quien lee la carta y luego pide la cuenta lo necesita para abrir sesión, y
 * quien recarga la página esperaría seguir donde estaba.
 *
 * `sessionStorage`, igual que la sesión de invitado y por lo mismo: muere con la
 * pestaña, no se comparte entre ellas, y no sobrevive a devolver el móvil. No es
 * un secreto -- está impreso en la mesa -- pero tampoco tiene por qué quedarse.
 */
export const scannedQr = {
  get: (): string | null => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(QR_KEY);
  },
  set: (token: string | null) => {
    if (typeof window === "undefined") return;
    if (token === null) window.sessionStorage.removeItem(QR_KEY);
    else window.sessionStorage.setItem(QR_KEY, token);
  },
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
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  // Con FormData el navegador pone el boundary: fijar Content-Type lo rompe.
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json";

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
    ...(opts.body === undefined
      ? {}
      : { body: isForm ? (opts.body as FormData) : JSON.stringify(opts.body) }),
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as { error?: ApiErrorBody } | T | null;

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
    if (!current)
      throw new ApiError(401, {
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

/**
 * Un fichero del servidor, con la sesión del personal, para guardarlo.
 *
 * `apiRequest` lee siempre JSON, y un PDF no lo es. Esto hace la misma
 * petición autenticada -- con la misma renovación de sesión si el token caducó
 * -- y devuelve el binario con el nombre que propone el servidor.
 */
export async function staffDownload(
  path: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const attempt = async () => {
    const s = staffSession.get();
    return fetch(`${API_BASE_URL}${path}`, {
      headers: s ? { Authorization: `Bearer ${s.accessToken}` } : {},
    });
  };

  let response = await attempt();
  if (response.status === 401) {
    try {
      await refreshOnce();
    } catch {
      staffSession.set(null);
    }
    response = await attempt();
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: ApiErrorBody } | null;
    throw new ApiError(
      response.status,
      payload?.error ?? {
        code: "UNKNOWN_ERROR",
        message: `Request failed with status ${response.status}`,
        details: {},
        requestId: "",
      },
    );
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? null };
}

/** Entrega un binario al navegador como descarga. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Un momento antes de soltarla: algunos navegadores empiezan la descarga
  // después de que `click()` vuelve.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------------------------------------------------------- staff */

/**
 * Lo que puede devolver un login.
 *
 * Con segundo factor activado no llegan tokens: llega un reto que hay que
 * canjear por un código. Es una unión y no un campo opcional a propósito -- así
 * el compilador obliga a mirar cuál de los dos vino, en vez de dejar que una
 * pantalla trate un reto como si fuera una sesión y guarde `undefined`.
 */
export type LoginResult =
  | ({ mfaRequired?: false } & StaffSession)
  | { mfaRequired: true; challenge: string; expiresIn: number };

export const isMfaChallenge = (
  r: LoginResult,
): r is { mfaRequired: true; challenge: string; expiresIn: number } => r.mfaRequired === true;

export type MfaStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

export type InvitationPreview = {
  email: string;
  role: StaffRole;
  restaurantName: string;
  expiresAt: string;
};

export type StaffInvitation = {
  id: string;
  email: string;
  role: StaffRole;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
};

export const auth = {
  /**
   * Puede no devolver una sesión.
   *
   * Sólo se guarda cuando lo es: guardar un reto dejaría en el almacén algo sin
   * `accessToken`, y todas las peticiones siguientes irían sin cabecera.
   */
  login: (email: string, password: string) =>
    apiRequest<LoginResult>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    }).then((result) => {
      if (!isMfaChallenge(result)) staffSession.set(result);
      return result;
    }),

  /**
   * Una invitación al equipo, vista desde su enlace. El token va en el cuerpo:
   * en la ruta acabaría en los registros de acceso.
   */
  previewInvitation: (token: string) =>
    apiRequest<InvitationPreview>("/api/v1/auth/invitations/preview", {
      method: "POST",
      body: { token },
    }),

  /** Aceptarla: la persona pone su contraseña y entra, como tras un login. */
  acceptInvitation: (body: { token: string; password: string; displayName?: string | null }) =>
    apiRequest<StaffSession>("/api/v1/auth/invitations/accept", {
      method: "POST",
      body,
    }).then((session) => {
      staffSession.set(session);
      return session;
    }),

  /** La otra mitad del login: un código contra el reto. */
  completeMfaLogin: (challenge: string, code: string) =>
    apiRequest<StaffSession>("/api/v1/auth/login/mfa", {
      method: "POST",
      body: { challenge, code },
    }).then((session) => {
      staffSession.set(session);
      return session;
    }),

  /** El segundo factor de quien pregunta, y de nadie más. */
  mfa: {
    status: () => apiRequest<MfaStatus>("/api/v1/auth/mfa", { auth: "staff" }),

    /** Devuelve el secreto una sola vez, para el QR. No queda activado todavía. */
    enrol: () =>
      apiRequest<{ secret: string; otpauthUri: string }>("/api/v1/auth/mfa/enrol", {
        method: "POST",
        auth: "staff",
      }),

    /** Lo activa demostrando que la app ya genera códigos buenos. */
    confirm: (code: string) =>
      apiRequest<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/confirm", {
        method: "POST",
        auth: "staff",
        body: { code },
      }),

    /** Pide un código: si no, un móvil desbloqueado bastaría para quitarlo. */
    disable: (code: string) =>
      apiRequest<void>("/api/v1/auth/mfa/disable", {
        method: "POST",
        auth: "staff",
        body: { code },
      }),

    /** Invalida la hoja anterior: la que alguien más pueda tener deja de valer. */
    regenerateRecoveryCodes: (code: string) =>
      apiRequest<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/recovery-codes", {
        method: "POST",
        auth: "staff",
        body: { code },
      }),
  },

  /** En cada arranque: /auth/me, nunca /auth/refresh para saber quién es. */
  me: () => apiRequest<{ user: StaffSession["user"] }>("/api/v1/auth/me", { auth: "staff" }),

  /**
   * El propio nombre. La cadena vacía lo borra: es lo que espera quien vacía la
   * casilla, y el servidor lo guarda como NULL en vez de como texto de cero
   * caracteres.
   */
  setDisplayName: (displayName: string) =>
    apiRequest<{ user: StaffSession["user"] }>("/api/v1/auth/me", {
      method: "PATCH",
      auth: "staff",
      body: { displayName },
    }),

  /**
   * Cambiar la propia contraseña.
   *
   * Responde igual que un login, y hay que guardar esa sesión: cambiarla
   * revoca todos los refresh tokens de la persona, incluido el que este
   * navegador tiene guardado. Si se ignorase la respuesta, quien acaba de
   * cambiarla se quedaría con un token muerto y se vería expulsado en la
   * siguiente renovación -- justo después de hacer algo bien.
   *
   * `sessionsRevoked` cuenta los *otros* dispositivos que se cerraron, que es
   * el dato que quiere quien cambia una contraseña porque cree que alguien más
   * la sabe.
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<StaffSession & { sessionsRevoked: number }>("/api/v1/auth/password", {
      method: "POST",
      auth: "staff",
      body: { currentPassword, newPassword },
    }).then((result) => {
      staffSession.set(result);
      return result;
    }),

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

/* ----------------------------------------------------------- onboarding */

/**
 * Lo que devuelve /onboarding/verify: una sesión de personal, más el
 * restaurante que se acaba de crear.
 */
export type OnboardingVerifyResult = StaffSession & {
  restaurant: {
    id: string;
    name: string;
    rif: string;
    menuCurrency: MenuCurrency;
    vatBps: number;
    serviceChargeBps: number;
  };
};

export const onboarding = {
  /**
   * Canjea el enlace de invitación y elige la contraseña.
   *
   * Deja la sesión guardada antes de devolver: el servidor firma una en la
   * misma respuesta -- la dirección ya está probada y la contraseña se acaba de
   * escribir, así que mandar a la pantalla de entrar sería pedir dos veces lo
   * mismo. Sin auth: el token del enlace es la credencial.
   */
  verify: (token: string, password: string) =>
    apiRequest<OnboardingVerifyResult>("/api/v1/onboarding/verify", {
      method: "POST",
      body: { token, password },
    }).then((result) => {
      staffSession.set({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
      return result;
    }),
};

/* ---------------------------------------------------------------- guest */

export const guest = {
  /**
   * Qué apunta el QR, sin abrir nada.
   *
   * Un código pegado a la mesa ya no significa sólo "abre la cuenta": esto
   * resuelve restaurante y mesa sin gastar una sesión, para que leer la carta
   * no cueste una. La sesión la abre `openSession`, y sólo quien pide la
   * cuenta.
   *
   * POST y no GET aunque sólo lea: el token viajaría en la URL y el backend
   * registra `req.url` en cada petición.
   */
  qrContext: (qrToken: string) =>
    apiRequest<QrContext>("/api/v1/guest/qr/context", {
      method: "POST",
      body: { qrToken },
    }),

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

  /** Persiste el reparto acordado: a partir de aquí cada parte tiene su techo. */
  createSplit: (body: SplitPreviewRequest) =>
    apiRequest<BillSplit>("/api/v1/guest/bill/splits", { method: "POST", body, auth: "guest" }),

  /** 404 cuando todavía no se ha acordado ningún reparto: estado normal. */
  activeSplit: () => apiRequest<BillSplit>("/api/v1/guest/bill/splits/active", { auth: "guest" }),

  /**
   * Le pone nombre a una parte del reparto, o lo borra con la cadena vacía.
   *
   * El servidor lo acepta mientras esa parte no haya recibido dinero; después
   * responde 409, porque entonces el nombre deja de ser una etiqueta y pasa a
   * ser el registro de quién pagó.
   */
  nameShare: (ref: string, name: string) =>
    apiRequest<BillSplit>(
      `/api/v1/guest/bill/splits/active/participants/${encodeURIComponent(ref)}`,
      { method: "PATCH", body: { name }, auth: "guest" },
    ),

  /**
   * Los bancos, para el desplegable de «tu banco» al declarar un pago.
   *
   * No es la misma lista que `c2pBanks`: aquélla son los bancos con integración
   * C2P y su guía de clave. Ésta es la lista completa, que es la que
   * `bankOrigin` valida contra.
   *
   * Hace falta porque ese campo es opcional pero cerrado: el servidor sólo
   * admite un código de la lista, así que una caja de texto convertía un campo
   * que nadie tenía que rellenar en un 400 que impedía pagar.
   */
  banks: () =>
    apiRequest<{ data: BankRef[] }>("/api/v1/guest/banks", { auth: "guest" }).then((r) => r.data),

  /** Guía de claves por banco. Se pide en el momento del pago: la clave caduca. */
  c2pBanks: () =>
    apiRequest<{ data: C2PBankClave[] }>("/api/v1/guest/c2p/banks", { auth: "guest" }).then(
      (r) => r.data,
    ),

  /**
   * Cargo C2P. La clave es de un solo uso y jamás se guarda ni se registra.
   * La clave de idempotencia se genera una vez por intento: reintentar con otra
   * puede cobrar dos veces.
   */
  c2pCharge: (body: C2PChargeRequest) =>
    apiRequest<C2PChargeResult>("/api/v1/guest/bill/c2p", {
      method: "POST",
      body,
      auth: "guest",
      headers: { "Idempotency-Key": body.idempotencyKey },
    }),

  /**
   * Pedir desde la mesa.
   *
   * Las líneas entran en la cuenta en el acto: no hay estado que seguir
   * después, y por eso la respuesta sólo confirma. La mesa no se manda -- la
   * pone la sesión de invitado, creada verificando la firma del QR.
   */
  order: (items: { productId: string; quantity: number }[]) =>
    apiRequest<{ orderId: string; createdAt: string; lineCount: number }>(
      "/api/v1/guest/bill/orders",
      { method: "POST", body: { items }, auth: "guest" },
    ),

  /** Aviso de pago: crea un claim PENDING, nunca cierra ni paga la cuenta. */
  paymentClaim: (body: PaymentClaimInput) =>
    apiRequest<PaymentClaim>("/api/v1/guest/bill/payment-claims", {
      method: "POST",
      body,
      auth: "guest",
    }),

  /**
   * «¿Necesitas factura?», después de pagar.
   *
   * Un cuerpo con sólo `paymentId` es una petición completa: consumidor final.
   * No es un atajo ni un formulario a medio llenar -- es el caso mayoritario, y
   * el backend lo trata como tal.
   *
   * Contesta 202 y `invoice: null` cuando el documento no llegó a existir. Eso
   * **no** significa que el pago fallara: por eso la respuesta trae
   * `paymentUnaffected`, y por eso quien lo pinte no debe hablar de un cobro
   * rechazado.
   */
  requestInvoice: (body: RequestInvoiceInput) =>
    apiRequest<RequestInvoiceResult>("/api/v1/guest/bill/invoice", {
      method: "POST",
      body,
      auth: "guest",
    }),

  /**
   * En qué quedó un pago que declaró este comensal.
   *
   * Sin esta lectura el teléfono no tenía forma de enterarse de que se lo
   * confirmaron: el aviso se guardaba en memoria con estado PENDING y ahí se
   * quedaba. La pantalla prometía la factura «cuando el restaurante confirme» y
   * no existía el camino por el que cumplirlo.
   */
  paymentStatus: (paymentId: string) =>
    apiRequest<{
      id: string;
      status: PaymentClaim["status"];
      amountVes: Money;
      billClosed: boolean;
      invoiced: boolean;
      /**
       * Si en este restaurante se puede pedir factura.
       *
       * Viaja con el pago y no con la cuenta a propósito: confirmar el cobro es
       * lo que cierra la mesa, así que la cuenta deja de leerse justo cuando la
       * factura empieza a poder pedirse.
       *
       * `false` significa que **no hay que ofrecer nada**, ni siquiera un «ya
       * podrás pedirla»: el servidor la va a rechazar, y un comensal que espera
       * por esa promesa es uno que no se la pidió al personal mientras podía.
       */
      canRequestInvoice: boolean;
      /** La factura de este cobro, cuando existe: su número y adónde se manda. */
      invoice?: { controlNumber: string; email: string | null } | null;
      /**
       * La factura pedida al avisar del pago. WAITING mientras el cobro está
       * por confirmar; FAILED si al confirmarlo no se pudo emitir, que es
       * cuando vuelve a ofrecerse pedirla a mano.
       */
      invoiceRequest?: {
        email: string;
        status: "WAITING" | "ISSUED" | "FAILED" | "SKIPPED";
      } | null;
    }>(`/api/v1/guest/payments/${paymentId}`, { auth: "guest" }),

  /**
   * El recibo de un cobro: la cuenta entera y, debajo, lo que puso esta persona.
   *
   * La sección `bill` viene derivada sólo de la cuenta, así que es idéntica en
   * los recibos de todos los comensales de la mesa. Lo único que cambia entre
   * ellos es `payment`. Eso es lo que permite ponerlos uno al lado del otro y
   * comprobar que cuentan la misma cena.
   *
   * **No es una factura fiscal** y no debe pintarse como si lo fuera.
   */
  receipt: (paymentId: string) =>
    apiRequest<GuestReceipt>(`/api/v1/guest/payments/${paymentId}/receipt`, { auth: "guest" }),

  /**
   * El correo del comensal, con la finalidad separada del dato.
   *
   * `marketingConsent` sólo va en `true` si marcó una casilla vacía. Dar el
   * correo para que llegue la factura no consiente publicidad -- son dos
   * cosas, y mandarlo siempre en true las convertiría en una.
   *
   * Devuelve lo que quedó guardado y no lo que se pidió: si había una baja
   * previa vuelve `false`, porque volver a dejar el correo no es volver a
   * decir que sí.
   */
  saveContact: (body: GuestContactInput) =>
    apiRequest<{ email: string; marketingConsent: boolean; withdrawn: boolean }>(
      "/api/v1/guest/bill/contact",
      { method: "POST", body, auth: "guest" },
    ),

  endSession: async () => {
    await apiRequest<void>("/api/v1/guest/sessions", { method: "DELETE", auth: "guest" }).catch(
      () => undefined,
    );
    guestSession.set(null);
  },
};

/* ------------------------------------------------------- tipos de dominio */

export type Money = string; // dígitos en unidades menores

/** Una línea de la cuenta, tal y como se imprime en el recibo. */
export type ReceiptLine = {
  id: string;
  name: string;
  quantity: number;
  unitPriceMinor: Money;
  subtotalMinor: Money;
  taxCategory: "TAXABLE" | "EXEMPT" | "EXONERATED" | "NON_TAXABLE";
  vatBps: number | null;
};

/**
 * El recibo. `bill` es de la mesa y `payment` es de quien mira: los recibos de
 * una mesa de cuatro comparten el primero y sólo se distinguen en el segundo.
 */
export type GuestReceipt = {
  restaurant: { name: string; rif: string | null; address: string | null };
  table: { name: string };
  bill: {
    id: string;
    status: "OPEN" | "CLOSED" | "VOID";
    currency: MenuCurrency;
    openedAt: string;
    lines: ReceiptLine[];
    subtotalMinor: Money;
    serviceChargeBps: number;
    serviceChargeMinor: Money;
    taxes: { vatBps: number; baseMinor: Money; vatMinor: Money }[];
    vatMinor: Money;
    totalMinor: Money;
    totalVes: Money;
    fxRateVesPerUnit: string | null;
  };
  payment: {
    id: string;
    status: PaymentClaim["status"];
    method: string;
    reference: string | null;
    amountVes: Money;
    tipVes: Money;
    handedOverVes: Money;
    declaredAt: string;
    invoiced: boolean;
    invoiceId: string | null;
  };
};
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
  /** Quién atendió la mesa. Es por donde se atribuyen las propinas. */
  servedBy?: string | null;
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
  /**
   * Si el restaurante puede cobrar por C2P ahora mismo. Sólo viene en la cuenta
   * del invitado; el panel no lo necesita.
   */
  c2pAvailable?: boolean;
  /**
   * Si aquí se puede pedir factura, dicho antes de pagar: decide si el aviso
   * de pago ofrece «envíame la factura». Sólo en la cuenta del invitado.
   */
  canRequestInvoice?: boolean;
  itemCount?: number;
  /**
   * Los tres de abajo sólo vienen en el resumen de `/tables/floor`, no en
   * `/bills/{id}`. Estaban en el contrato desde el principio y este tipo no los
   * declaraba, así que el panel se los perdía y calculaba la antigüedad
   * restando fechas en el navegador -- justo lo que el contrato dice que no se
   * haga, porque usa el reloj de quien mira.
   */
  /** Cuándo se abrió, según el servidor. */
  openedAt?: string | null;
  /** Cuánto lleva abierta, en minutos, calculado por el servidor. */
  openMinutes?: number | null;
  /** Avisos de pago de esta mesa que esperan a que alguien los verifique. */
  pendingClaims?: number;
  /** Propinas ya liquidadas en esta cuenta. */
  tipVes?: Money;
  createdAt?: string;
  updatedAt?: string;
  items?: BillItem[];
  /** Datos de Pago Móvil del restaurante; null si no los ha configurado. */
  payee?: Payee | null;
};

/** Un Pago Móvil se direcciona por banco + teléfono + cédula/RIF: no hay número de cuenta. */
export type Payee = {
  bankCode: string;
  bankName: string;
  phone: string;
  holderId: string;
};

/** Aviso de pago del comensal. NO paga la cuenta: el personal lo verifica. */
export type PaymentClaim = {
  id: string;
  billId?: string;
  amountVes: Money;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  paymentMethod?: "PAGO_MOVIL";
  declaredReference: string | null;
  createdAt: string;
  updatedAt?: string;
};

/** Lo que ve el personal: incluye el detalle corroborante del comensal. */
export type StaffPaymentClaim = PaymentClaim & {
  phoneOrigin?: string | null;
  bankOrigin?: string | null;
  /** El nombre del banco, resuelto por el servidor; null si el código no se conoce. */
  bankOriginName?: string | null;
  /** La cédula o el RIF del pagador, que el banco imprime junto al movimiento. */
  idOrigin?: string | null;
  declaredAt?: string | null;
  /** Lo que el comensal añadió de propina en la misma transferencia. */
  tipVes?: Money;
  /** Parte + propina: la cifra que llegó al banco y que se busca en su app. */
  totalPaidVes?: Money;
  /** Sólo en la cola: de qué mesa es y, si lo dio, quién paga. */
  tableName?: string | null;
  payerName?: string | null;
};

/** Cuántos avisos esperan y desde cuándo. La antigüedad la calcula el servidor. */
export type ClaimsSummary = {
  pending: number;
  oldestPendingAt: string | null;
  oldestPendingAgeSeconds: number | null;
};

/** Propinas de un periodo, separadas por cómo llegaron: efectivo ya está en caja. */
/** Lo que le tocó a cada quien. `userId` null es la cuenta sin mesero asignado. */
export type TipsByServer = {
  userId: string | null;
  email: string | null;
  payments: number;
  tipsVes: Money;
  billedVes: Money;
  tipRateBps?: number;
};

/**
 * La sala ahora mismo, más lo cobrado en una ventana.
 *
 * Todas las sumas las hace el servidor. Es la diferencia que importa: el
 * cliente no hace aritmética con dinero, así que hasta ahora el panel podía
 * contar mesas pero no decir cuánto se debe en total.
 */
export type TakingsChannel = { paymentsVes: Money; payments: number };

/**
 * Un pedido que mandó un comensal, como lo lee el panel.
 *
 * `lineCount` es lo que se pidió y `items` lo que queda: si un mesero quitó una
 * línea, ya no se debe y nadie tiene que prepararla, pero el pedido siguió
 * teniendo tres. Las dos cifras dicen cosas distintas.
 */
export type GuestOrder = {
  id: string;
  tableId: string;
  tableName: string;
  billId: string | null;
  /**
   * A quién está atribuida la cuenta, que en un pedido por QR suele ser nadie:
   * la abrió el comensal. Null es el caso normal aquí, no un fallo.
   */
  servedBy: string | null;
  lineCount: number;
  items: { name: string; quantity: number; subtotalMinor: Money }[];
  createdAt: string;
  /** Lo calcula el servidor: un reloj mal puesto no puede envejecer un pedido. */
  ageSeconds: number | null;
};

/** Rebaja acordada, cortesía de la casa, o dinero que no se va a cobrar. */
export type SettleReason = "DISCOUNT" | "COMP" | "WRITE_OFF";

export type BillAdjustment = {
  id: string;
  amountVes: Money;
  reason: SettleReason;
  note: string | null;
  createdAt: string;
};

export type ServiceSnapshot = {
  asOf: string;
  since: string | null;
  tables: { total: number; occupied: number; free: number };
  openBills: {
    count: number;
    totalDueVes: Money;
    amountPaidVes: Money;
    outstandingVes: Money;
    oldestOpenedAt: string | null;
  };
  taken: {
    paymentsVes: Money;
    tipsVes: Money;
    payments: number;
    /**
     * Cómo llegó el dinero, que no es dónde está.
     *
     * `app` es lo que el comensal pagó solo desde su teléfono (C2P, Pago
     * Móvil); `till` lo que registró alguien de la casa; `unclassified` es
     * `SPLITE` y `OTHER`, que no nombran ningún canal y el servidor se niega a
     * adivinar. Los tres suman el total de arriba.
     *
     * Opcional porque un backend anterior a este desglose no lo manda, y el
     * panel tiene que seguir pintando el total.
     */
    byChannel?: {
      app: TakingsChannel;
      till: TakingsChannel;
      unclassified: TakingsChannel;
    };
  };
  claims: {
    pending: number;
    oldestPendingAt: string | null;
    oldestPendingAgeSeconds: number | null;
  };
  unresolvedC2P: { inDoubt: number; ambiguous: number };
};

export type ActivityEntry = {
  kind: string;
  at: string;
  paymentId: string | null;
  billId: string | null;
  tableId: string | null;
  tableName: string | null;
  amountVes: Money | null;
  tipVes: Money | null;
  paymentMethod: string | null;
};

/** Las propinas de quien pregunta. Cualquier rol: un mesero mira las suyas. */
export type MyTips = {
  from: string;
  to: string;
  currency: "VES";
  userId: string;
  tipsVes: Money;
  billedVes: Money;
  tipRateBps: number;
  payments: number;
  bills: number;
};

export type TipsReport = {
  from: string;
  to: string;
  currency: "VES";
  totalTipsVes: Money;
  inTillVes: Money;
  owedToStaffVes: Money;
  unclassifiedVes: Money;
  billedVes?: Money;
  tipRateBps?: number;
  /**
   * La atribución se lee por `bills.servedBy` en el momento de la consulta, así
   * que corregir quién atendió una mesa mueve las propinas con ella.
   */
  byServer?: TipsByServer[];
  /**
   * Las cuentas detrás de la fila sin dueño de `byServer`.
   *
   * Una cifra sin dueño no se puede corregir: dice cuánto y no de qué mesas. Y
   * cuando se lee este informe, al cerrar el turno, esas cuentas ya están
   * cerradas y no salen en ninguna otra pantalla -- el selector de "Atendida
   * por" vive en la hoja de una mesa, y una mesa cerrada no tiene hoja.
   */
  unassigned?: UnassignedBill[];
  byMethod?: { method: string; payments: number; tipsVes: Money }[];
};

export type UnassignedBill = {
  billId: string;
  tableId: string | null;
  /** Null si la mesa se borró después. La cuenta y su propina siguen siendo reales. */
  tableName: string | null;
  status: string;
  payments: number;
  tipsVes: Money;
  billedVes: Money;
  lastPaidAt: string;
};

export type PaymentClaimInput = {
  amountVes: Money;
  reference: string;
  phoneOrigin?: string;
  bankOrigin?: string;
  /**
   * La propina, aparte del importe de la cuenta.
   *
   * El comensal transfiere `amountVes + tipVes` de una vez desde su banco; la
   * cuenta sólo ve `amountVes`. El backend lo acepta desde hace tiempo y lo
   * dice en su propio esquema: faltaba que el frontend lo mandara.
   */
  tipVes?: Money;
  /** Atribuye el aviso a una parte del reparto persistente. */
  splitParticipantId?: string;
  /**
   * «Envíame la factura». Se emite sola cuando el restaurante confirme el
   * cobro, y llega a `email`. Ofrecerla sólo si la cuenta trae
   * `canRequestInvoice`.
   */
  invoice?: { email: string; name?: string; taxId?: string };
};

export type SplitMode = "FULL" | "EQUAL" | "ITEMS" | "CUSTOM";

export type SplitPreviewRequest = {
  mode: SplitMode;
  participants: { id: string; name?: string; amountVes?: Money }[];
  claims?: { itemId: string; quantity?: number; participantIds: string[] }[];
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

/** Una parte persistida del reparto: se paga contra su propio techo. */
export type SplitParticipant = {
  id: string;
  ref: string;
  name: string | null;
  amountVes: Money;
  amountPaidVes: Money;
  remainingVes: Money;
  settled: boolean;
  usdReference: string | null;
};

/** Reparto acordado y guardado: las partes suman basisVes (saldo al acordarlo). */
export type BillSplit = {
  id: string;
  billId: string;
  mode: SplitMode;
  status: "ACTIVE" | "VOID";
  currency: "VES";
  basisVes: Money;
  createdByType: "STAFF" | "GUEST";
  participants: SplitParticipant[];
  createdAt?: string;
};

/** Guía estática de cómo obtener la clave C2P en cada banco. */
export type C2PBankClave = {
  bankCode: string;
  bankName: string | null;
  ttlMinutes: number | null;
  ttlLabel: string;
  amountBound: boolean;
  strategy: { when: "anytime" | "at_payment"; reason: string } | null;
  channels: {
    channel: "APP" | "WEB" | "SMS";
    text: string;
    shortCode?: string;
    smsBody?: string;
    altShortCode?: string | null;
  }[];
};

/**
 * Cargo C2P contra la cuenta del propio comensal. La clave nunca se guarda.
 * El contrato no admite atribuir el cargo a una parte del reparto: el techo de
 * la parte se respeta en el monto, no en un campo extra (el backend rechaza
 * propiedades desconocidas con VALIDATION_FAILED).
 */
export type C2PChargeRequest = {
  amountVes: Money;
  bankCode: string;
  idNumber: string;
  phone: string;
  clave: string;
  idempotencyKey: string;
  /**
   * La propina, dentro del mismo cargo.
   *
   * El banco del comensal cobra `amountVes + tipVes` de una vez; la cuenta sólo
   * ve `amountVes`, que es lo que impide que el cargo se pase del saldo. El
   * contrato lo admite desde que se enhebró la propina por las tres vías; era
   * el cliente el que no lo mandaba, así que quien pagaba con tarjeta dejaba la
   * propina que no llegaba a cobrarse.
   */
  tipVes?: Money;
};

export type C2PStatus = "SUCCEEDED" | "FAILED" | "IN_DOUBT" | "AMBIGUOUS";

export type C2PChargeResult = {
  paymentId: string;
  status: C2PStatus;
  invoiceNumber?: string;
  bankReference?: string | null;
  reason?: string | null;
  safeToRetry?: boolean;
  settlement?: PaymentResult;
};

export type C2PUnresolvedCharge = {
  paymentId: string;
  billId: string;
  amountVes: Money;
  status: "IN_DOUBT" | "AMBIGUOUS";
  invoiceNumber: string;
  payerBankCode: string;
  payerBankName: string | null;
  payerPhoneLast4: string;
  candidateReferences: string[];
  lastReason: string | null;
  lastResolutionAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type C2PResolution = {
  paymentId: string;
  status: C2PStatus;
  bankReference?: string | null;
  signals?: string[];
  candidateReferences?: string[];
  reason?: string | null;
  requiresStaffReview?: boolean;
  resolutionPending?: boolean;
  retryAfterMinutes?: number;
  alreadyResolved?: boolean;
  safeToRetry?: boolean;
  settlement?: PaymentResult;
};

/** Dónde cobra el restaurante. Splite nunca retiene el dinero. */
export type Payout = {
  bankCode: string;
  bankName?: string | null;
  chargeable?: boolean;
  accountNumber: string;
  phone: string;
  holderId: string;
};

export type PaymentProviderConfig = {
  provider: string;
  configured: boolean;
  enabled: boolean;
  credentialsValidatedAt: string | null;
  updatedAt: string;
};

export type BankRef = { code: string; name: string; chargeable: boolean };

export type Account = {
  id: string;
  name: string;
  rif: string | null;
  menuCurrency: MenuCurrency;
  vatBps: number;
  serviceChargeBps: number;
  payout: Payout | null;
  plan?: {
    tier: "TRIAL" | "STARTER" | "PRO" | "ENTERPRISE";
    trialEndsAt: string | null;
    trialDaysRemaining: number | null;
    /**
     * Lo que este escalón incluye, un booleano por capacidad.
     *
     * Se lee en vez de codificar aquí la tabla de precios: un botón que
     * contesta 403 es peor experiencia que un botón que no se ofrece, y una
     * copia de la tabla en el frontend es la misma tabla mantenida dos veces.
     *
     * Ojo: un `false` significa «no entra en este plan», que no siempre es lo
     * mismo que «la API lo va a rechazar» -- ver `entitlements.js` en el
     * backend.
     */
    capabilities?: Record<string, boolean>;
  };
  /** A quién se le factura: a cada comensal, o a la mesa. */
  fiscalInvoicePolicy?: "PER_DINER" | "SINGLE_BILL";
  /** El domicilio que encabeza el recibo. Nulo si no se ha registrado. */
  fiscalAddress?: string | null;
  createdAt?: string;
};

/**
 * La serie que el SENIAT le autorizó al restaurante.
 *
 * Los números van como cadena y no como `number` a propósito: un rango
 * autorizado puede pasarse de lo que un entero de JavaScript representa sin
 * perder precisión, y un correlativo fiscal redondeado es un número que no
 * existe.
 */
export type FiscalSeries = {
  controlPrefix: string;
  documentPrefix: string;
  padTo: number;
  controlFirst: string;
  controlLast: string | null;
  authorisationRef: string | null;
  /** Formateado: es el que va a imprimir la próxima factura. */
  nextControlNumber: string;
  /** Cierto en cuanto la serie ha numerado algo. Cuatro campos dejan de poder cambiar. */
  locked: boolean;
  updatedAt?: string | null;
};

export type FiscalSeriesInput = {
  controlPrefix: string;
  documentPrefix: string;
  padTo: number;
  controlFirst: number;
  controlLast: number | null;
  authorisationRef: string;
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
  /** La sección, o null si no tiene. El nombre viene resuelto por el backend. */
  categoryId?: string | null;
  categoryName?: string | null;
  /**
   * La foto del plato, o null si el restaurante no ha subido ninguna -- que es
   * el caso normal y tiene que verse deliberado, no roto.
   *
   * Se usa tal cual viene, con su sufijo `?v=`: ese sufijo cambia cuando cambia
   * la foto, y es lo único que impide que un móvil siga enseñando el plato de
   * la temporada pasada. Montarla a mano desde el id la rompe.
   */
  imageUrl: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/** Un producto tal y como lo ve un comensal: sin `active`, con su sección. */
/**
 * Cómo llegó el dinero, cuando lo registra alguien en la caja.
 *
 * Un subconjunto de lo que acepta el servidor: `SPLITE` es para pagos hechos
 * dentro de la app y no es algo que un cajero deba poder elegir, y `OTHER` no
 * dice nada que sirva para cuadrar el cajón.
 */
export type TillPaymentMethod = "CASH" | "CARD" | "TRANSFER";

export type PublicProduct = {
  id: string;
  name: string;
  description: string | null;
  priceMinorUnits: Money;
  currency: MenuCurrency;
  categoryId: string | null;
  categoryName: string | null;
  /** Ver `Product.imageUrl`: se usa tal cual, con sufijo incluido. */
  imageUrl: string | null;
};

/** Una seccion de la carta. `position` es el orden impreso, no alfabético. */
export type MenuCategory = {
  id: string;
  name: string;
  position: number;
  active: boolean;
  /** Sólo en los listados que lo cuentan; ausente no es cero. */
  productCount?: number;
};

/** La carta subida tal cual, descrita. Los bytes tienen su propia ruta. */
export type MenuDocument = {
  filename: string;
  contentType: string;
  sizeBytes: number;
  updatedAt: string;
  /** Ruta pública. Viene dada para que el cliente no la arme mal. */
  url: string;
};

export type PublicMenu = {
  restaurant: { id: string; name: string; menuCurrency: MenuCurrency } & Branding;
  /** La carta subida, o null si no hay ninguna. */
  menuPdf: MenuDocument | null;
  categories: MenuCategory[];
  products: PublicProduct[];
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

/**
 * Orden de mesas como las cuenta una persona: «Mesa 5» antes que «Mesa 31».
 *
 * El servidor ordena por texto, carácter a carácter, y así «Mesa 31» salía
 * antes que «Mesa 5» y todas las mayúsculas antes que cualquier minúscula. Se
 * ordena aquí, en el único sitio por el que pasan todas las listas de mesas,
 * para que ninguna pantalla pueda olvidarlo.
 */
const tableNameOrder = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
export function sortTablesByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => tableNameOrder.compare(a.name, b.name));
}

export const tables = {
  list: () => listAll<Table>("/api/v1/tables").then(sortTablesByName),

  /** Un solo GET con todas las mesas: openBill = null significa mesa libre, no error. */
  floor: () =>
    apiRequest<{ data: FloorTable[] } | FloorTable[]>("/api/v1/tables/floor", {
      auth: "staff",
    }).then((r) => sortTablesByName(Array.isArray(r) ? r : r.data)),
  /**
   * Crea de golpe las mesas que dice tener el restaurante.
   *
   * Idempotente: rellena lo que falte de `<prefijo> 1` a `<prefijo> N` y deja
   * el resto en paz, así que repetirlo no es un error y subir el número más
   * tarde añade sólo las nuevas. Nunca borra -- una mesa con cuentas no es algo
   * que deba poder quitar un número en un formulario.
   */
  createMany: (count: number, prefix = "Mesa") =>
    apiRequest<{ created: number; alreadyExisted: number; data: Table[] }>("/api/v1/tables/bulk", {
      method: "POST",
      auth: "staff",
      body: { count, prefix },
    }),

  create: (name: string) =>
    apiRequest<Table>("/api/v1/tables", { method: "POST", auth: "staff", body: { name } }),
  rename: (tableId: string, name: string) =>
    apiRequest<Table>(`/api/v1/tables/${tableId}`, {
      method: "PATCH",
      auth: "staff",
      body: { name },
    }),
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
    apiRequest<{ token: string; expiresIn: number }>(`/api/v1/guest/tables/${tableId}/qr/rotate`, {
      method: "POST",
      auth: "staff",
    }),
};

/** Menú del restaurante: la moneda la fija el restaurante, nunca la petición. */
/* ---------------------------------------------------------------- personal */

/**
 * La gente que trabaja aquí.
 *
 * OWNER y MANAGER. El servidor decide además qué puede hacer cada uno a quién
 * -- rango, nunca a uno mismo, y siempre queda un dueño activo -- y esas reglas
 * llegan como códigos de error, no se reimplementan aquí: una comprobación
 * duplicada en el cliente es una que se puede quedar atrás.
 */
export const staff = {
  /** Las invitaciones abiertas: sin aceptar, sin anular y sin caducar. */
  invitations: () =>
    apiRequest<{ data: StaffInvitation[] }>("/api/v1/account/invitations", {
      auth: "staff",
    }).then((r) => r.data),

  /**
   * Invitar. El enlace llega aquí una sola vez: el servidor sólo guarda su
   * hash. `emailed` dice si además salió por correo.
   */
  invite: (body: { email: string; role: StaffRole }) =>
    apiRequest<{ invitation: StaffInvitation; link: string; emailed: boolean }>(
      "/api/v1/account/invitations",
      { method: "POST", auth: "staff", body },
    ),

  revokeInvitation: (id: string) =>
    apiRequest<void>(`/api/v1/account/invitations/${id}`, { method: "DELETE", auth: "staff" }),

  list: () =>
    apiRequest<{ data: StaffMember[] }>("/api/v1/account/users", { auth: "staff" }).then(
      (r) => r.data,
    ),

  create: (body: { email: string; password: string; role: StaffRole }) =>
    apiRequest<{ user: StaffMember }>("/api/v1/account/users", {
      method: "POST",
      auth: "staff",
      body,
    }).then((r) => r.user),

  /**
   * Cambia el rol, la situación, o las dos.
   *
   * `sessionsRevoked` viene en la respuesta a propósito: quien acaba de dar de
   * baja a alguien quiere saber que sus sesiones han caído -- y también que el
   * token que esa persona lleva encima sigue valiendo hasta que caduque.
   */
  update: (id: string, body: { role?: StaffRole; active?: boolean }) =>
    apiRequest<{ user: StaffMember; sessionsRevoked: number }>(`/api/v1/account/users/${id}`, {
      method: "PATCH",
      auth: "staff",
      body,
    }),

  /** Le pone contraseña a otra persona, que es también cómo se recupera una olvidada. */
  resetPassword: (id: string, password: string) =>
    apiRequest<{ sessionsRevoked: number }>(`/api/v1/account/users/${id}/password`, {
      method: "POST",
      auth: "staff",
      body: { password },
    }),
};

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

  /* ------------------------------------------------------ secciones */

  /** Las secciones del menú, con cuántos productos hay en cada una. */
  categories: () =>
    apiRequest<{ data: MenuCategory[]; uncategorisedCount: number }>("/api/v1/menu/categories", {
      auth: "staff",
    }),

  /** Sin `position` la sección se coloca al final, que es lo que casi siempre se quiere. */
  createCategory: (body: { name: string; position?: number; active?: boolean }) =>
    apiRequest<MenuCategory>("/api/v1/menu/categories", { method: "POST", auth: "staff", body }),

  updateCategory: (id: string, body: { name?: string; position?: number; active?: boolean }) =>
    apiRequest<MenuCategory>(`/api/v1/menu/categories/${id}`, {
      method: "PATCH",
      auth: "staff",
      body,
    }),

  /**
   * El orden entero de una vez: el array *es* el orden.
   *
   * Mandar una posición por sección haría que cada estado intermedio fuese un
   * estado que alguien puede leer -- dos secciones reclamando la 3 mientras va
   * la siguiente petición -- y una petición perdida dejaría el menú así.
   */
  reorderCategories: (ids: string[]) =>
    apiRequest<void>("/api/v1/menu/categories/order", {
      method: "PUT",
      auth: "staff",
      body: { ids },
    }),

  /** Borra la cabecera, no la comida: sus productos quedan sin sección. */
  deleteCategory: (id: string) =>
    apiRequest<void>(`/api/v1/menu/categories/${id}`, { method: "DELETE", auth: "staff" }),

  /* ----------------------------------------------------- carta en PDF */

  /** 404 cuando no hay ninguna subida: estado normal, no un error. */
  pdf: () => apiRequest<MenuDocument>("/api/v1/menu/pdf", { auth: "staff" }),

  /** Sustituye la que hubiera: hay una por restaurante. */
  uploadPdf: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<MenuDocument>("/api/v1/menu/pdf", {
      method: "PUT",
      auth: "staff",
      body: form,
    });
  },

  deletePdf: () => apiRequest<void>("/api/v1/menu/pdf", { method: "DELETE", auth: "staff" }),

  /* ------------------------------------------------------ foto del plato */

  /**
   * Sustituye la que hubiera: hay una por producto.
   *
   * Devuelve el producto, no el archivo: con `imageUrl` ya puesta, la pantalla
   * enseña la foto nueva sin una segunda petición.
   */
  uploadProductImage: (productId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<Product>(`/api/v1/menu/products/${productId}/image`, {
      method: "PUT",
      auth: "staff",
      body: form,
    });
  },

  deleteProductImage: (productId: string) =>
    apiRequest<void>(`/api/v1/menu/products/${productId}/image`, {
      method: "DELETE",
      auth: "staff",
    }),

  /* --------------------------------------------- portada y logo del local */

  uploadBranding: (kind: BrandingKind, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<{ kind: BrandingKind; url: string }>(`/api/v1/menu/branding/${kind}`, {
      method: "PUT",
      auth: "staff",
      body: form,
    });
  },

  deleteBranding: (kind: BrandingKind) =>
    apiRequest<void>(`/api/v1/menu/branding/${kind}`, { method: "DELETE", auth: "staff" }),

  /**
   * La carta que ve un comensal. Sin token: quien escanea la mesa no tiene
   * credenciales de personal.
   *
   * Las secciones llegan aparte de los productos, en su orden, para poder
   * pintar las cabeceras en el orden de la carta en vez de deducirlo de los
   * productos que hayan vuelto.
   */
  publicMenu: (restaurantId: string) =>
    apiRequest<PublicMenu>(`/api/v1/menu/public/${restaurantId}/products`),

  createProduct: (body: {
    name: string;
    priceMinorUnits: Money;
    description?: string | null;
    /** La sección. Null es "sin sección", que es una respuesta real. */
    categoryId?: string | null;
  }) => apiRequest<Product>("/api/v1/menu/products", { method: "POST", auth: "staff", body }),
  updateProduct: (
    id: string,
    body: {
      name?: string;
      priceMinorUnits?: Money;
      description?: string | null;
      active?: boolean;
      categoryId?: string | null;
    },
  ) => apiRequest<Product>(`/api/v1/menu/products/${id}`, { method: "PATCH", auth: "staff", body }),
  /** Sin `permanent` sólo desactiva; con `permanent` borra (las cuentas guardan su snapshot). */
  deleteProduct: (id: string, permanent = false) =>
    apiRequest<void>(`/api/v1/menu/products/${id}${permanent ? "?permanent=true" : ""}`, {
      method: "DELETE",
      auth: "staff",
    }),
  /** Sube una foto/PDF del menú y devuelve un borrador. No escribe nada. */
  ocrExtract: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<MenuOcrDraft>("/api/v1/menu/ocr-extract", {
      method: "POST",
      auth: "staff",
      body: form,
    });
  },
  /** Confirma las filas revisadas: se validan como productos escritos a mano. */
  ocrImport: (
    items: {
      name: string;
      priceMinorUnits: Money;
      description?: string | null;
      /** El encabezado bajo el que aparecía. El servidor crea la sección si no existe. */
      section?: string | null;
    }[],
  ) =>
    apiRequest<MenuOcrImportResult>("/api/v1/menu/ocr-import", {
      method: "POST",
      auth: "staff",
      body: { items },
    }),
};

export type MenuOcrDraftItem = {
  name?: string;
  description?: string | null;
  section?: string | null;
  priceText?: string | null;
  priceMinorUnits?: string | null;
  needsPrice?: boolean;
  duplicateName?: boolean;
  currency?: MenuCurrency;
};

export type MenuOcrDraft = {
  items?: MenuOcrDraftItem[];
  pages?: number;
  currency?: MenuCurrency;
  currencyGuess?: string | null;
  notes?: string | null;
  needsReview?: number;
};

export type MenuOcrImportResult = {
  importedCount?: number;
  items?: Product[];
  errors?: { index?: number; name?: string; code?: string; message?: string }[];
};

export const bills = {
  get: (id: string) => apiRequest<Bill>(`/api/v1/bills/${id}`, { auth: "staff" }),

  /**
   * Corrige quién atendió la mesa. OWNER y MANAGER.
   *
   * Mueve dinero entre personas: las propinas se atribuyen por el servidor
   * *actual* de la cuenta, así que corregir esto mueve también las de ayer.
   * `null` la deja sin atribuir, que es mejor que atribuirla mal.
   */
  setServer: (id: string, servedBy: string | null) =>
    apiRequest<Bill>(`/api/v1/bills/${id}/server`, {
      method: "PATCH",
      auth: "staff",
      body: { servedBy },
    }),
  /** Listado sin líneas: es lo único que trae `createdAt` (antigüedad de la cuenta). */
  list: (status: Bill["status"] = "OPEN") => listAll<Bill>(`/api/v1/bills?status=${status}`),
  /** Abrir con total 0 es lo que permite luego añadir líneas del menú. */
  open: (tableId: string, totalDueMinorUnits: Money = "0") =>
    apiRequest<Bill>("/api/v1/bills", {
      method: "POST",
      auth: "staff",
      body: { tableId, totalDueMinorUnits },
    }),
  /** Anular una cuenta en la que no entró nada: el backend la marca VOID y libera la mesa. */
  void: (id: string) =>
    apiRequest<Bill>(`/api/v1/bills/${id}/void`, { method: "POST", auth: "staff" }),
  /**
   * Cerrarla con lo que de verdad entró, y decir por qué falta el resto.
   *
   * Para todo lo que no cuadra al céntimo: la mesa que se fue debiendo, la
   * cortesía sobre una cuenta ya cobrada en parte, el plato devuelto después de
   * pagar. Antes eso no se podía cerrar de ninguna manera -- anular se rechaza
   * en cuanto hay dinero -- y la mesa se quedaba ocupada para siempre.
   */
  settle: (id: string, body: { reason: SettleReason; note?: string }) =>
    apiRequest<{ bill: Bill; adjustment: BillAdjustment | null }>(`/api/v1/bills/${id}/settle`, {
      method: "POST",
      auth: "staff",
      body,
    }),
  items: (id: string) =>
    apiRequest<{ data: BillItem[] }>(`/api/v1/bills/${id}/items`, { auth: "staff" }).then(
      (r) => r.data,
    ),
  /**
   * Una comanda entera, de una vez.
   *
   * El cliente mandaba una llamada por producto y las encadenaba con `await`,
   * así que "dos tequeños y una cachapa" eran dos peticiones que podían fallar
   * por la mitad y dejar media comanda puesta. El servidor tiene este endpoint
   * justo para eso -- hasta cincuenta líneas en una transacción -- y además
   * abre la cuenta si la mesa no tenía ninguna, que es lo que hace que tomar
   * nota en una mesa libre sea una acción y no dos.
   */
  order: (tableId: string, items: { productId: string; quantity: number }[]) =>
    apiRequest<{ opened: boolean; bill: Bill }>(`/api/v1/bills/tables/${tableId}/order`, {
      method: "POST",
      auth: "staff",
      body: { items },
    }),
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
  /** Reparto persistente creado por el personal. */
  createSplit: (id: string, body: SplitPreviewRequest) =>
    apiRequest<BillSplit>(`/api/v1/bills/${id}/splits`, { method: "POST", body, auth: "staff" }),
  /** 404 mientras no haya reparto acordado: estado normal, no error. */
  activeSplit: (id: string) =>
    apiRequest<BillSplit>(`/api/v1/bills/${id}/splits/active`, { auth: "staff" }),
  /** 409 SPLIT_HAS_PAYMENTS si alguna parte ya se pagó: entonces no se puede anular. */
  voidSplit: (id: string, splitId: string) =>
    apiRequest<BillSplit>(`/api/v1/bills/${id}/splits/${splitId}/void`, {
      method: "POST",
      auth: "staff",
    }),
  /** La clave de idempotencia se genera una vez por intento y se reutiliza en cada reintento. */
  /**
   * Cobra contra una cuenta.
   *
   * `paymentMethod` va siempre. Antes se omitía y el servidor aplicaba su valor
   * por defecto, `SPLITE`, que es el de un pago hecho dentro de la app -- así
   * que un cobro en efectivo en la caja quedaba registrado como si el dinero
   * hubiera entrado por Splite. No es sólo la etiqueta: el informe de propinas
   * reparte según el método (`CASH` está en caja, `CARD`/`TRANSFER` se le deben
   * al personal) y `SPLITE` no está en ninguno de los dos, así que todas esas
   * propinas caían en "sin clasificar" y el restaurante no podía saber qué
   * tenía en el cajón.
   */
  pay: (
    id: string,
    amountMinorUnits: Money,
    idempotencyKey: string,
    options: {
      paymentMethod: TillPaymentMethod;
      splitParticipantId?: string;
      /**
       * Lo que el cliente da de más y no quiere de vuelta.
       *
       * Va aparte del importe a propósito, y así lo trata el servidor: la
       * cuenta sólo ve `amountMinorUnits`, y el informe de propinas reparte
       * esto según el método. Sin mandarlo, cobrar 20.000 de una cuenta de
       * 16.404,92 era `PAYMENT_EXCEEDS_BALANCE` y la propina no existía.
       */
      tipMinorUnits?: Money;
    },
  ) =>
    apiRequest<PaymentResult>(`/api/v1/bills/${id}/payments`, {
      method: "POST",
      auth: "staff",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        billId: id,
        amountMinorUnits,
        currency: "VES",
        idempotencyKey,
        paymentMethod: options.paymentMethod,
        ...(options.tipMinorUnits && BigInt(options.tipMinorUnits) > 0n
          ? { tipMinorUnits: options.tipMinorUnits }
          : {}),
        ...(options.splitParticipantId ? { splitParticipantId: options.splitParticipantId } : {}),
      },
    }),
};

/**
 * Los pedidos que la sala no ha mirado.
 *
 * `summary` es el número para el distintivo y `list` la bandeja con lo que se
 * pidió. Dos llamadas y no una porque el panel pinta el número en todas las
 * pantallas y la lista sólo en una: traerse las comandas enteras para dibujar
 * un contador es lo que ya se evitó con los avisos de pago.
 */
export const orders = {
  list: () =>
    apiRequest<{ data: GuestOrder[] }>("/api/v1/orders", { auth: "staff" }).then((r) => r.data),
  summary: () =>
    apiRequest<{
      pending: number;
      oldestPendingAt: string | null;
      oldestPendingAgeSeconds: number | null;
    }>("/api/v1/orders/summary", { auth: "staff" }),
  /** Sacarlo de la bandeja. No toca la cuenta: el dinero ya estaba dentro. */
  ack: (id: string) =>
    apiRequest<{ id: string; acknowledgedAt: string }>(`/api/v1/orders/${id}/ack`, {
      method: "POST",
      auth: "staff",
    }),
};

/** Cola de verificación: avisos de pago y cargos C2P sin resolver. */
export const payments = {
  claims: (status: PaymentClaim["status"] = "PENDING", billId?: string) =>
    apiRequest<{ data: StaffPaymentClaim[] }>(
      `/api/v1/payments/claims?status=${status}&limit=100${billId ? `&billId=${billId}` : ""}`,
      { auth: "staff" },
    ).then((r) => r.data),
  /**
   * Un agregado barato para saber que alguien espera sin abrir la cola.
   * Se consulta a intervalo humano (15–30 s): comparte el límite de peticiones.
   */
  claimsSummary: () =>
    apiRequest<ClaimsSummary>("/api/v1/payments/claims/summary", { auth: "staff" }),
  /** Propinas del periodo: `from` inclusivo y `to` exclusivo, para que los turnos no se solapen. */
  tips: (from: string, to: string) =>
    apiRequest<TipsReport>(
      `/api/v1/payments/tips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { auth: "staff" },
    ),

  /**
   * Todo el panel en una sola llamada, y con las sumas ya hechas.
   *
   * Cualquier rol autenticado: un mesero necesita saber qué mesas suyas siguen
   * debiendo tanto como el dueño.
   */
  dashboard: (from?: string) =>
    apiRequest<ServiceSnapshot>(
      `/api/v1/payments/dashboard${from ? `?from=${encodeURIComponent(from)}` : ""}`,
      { auth: "staff" },
    ),

  /**
   * Lo que ha pasado desde la última vez que se miró.
   *
   * `since` es el `asOf` de la respuesta anterior, no una hora que invente el
   * cliente: con un reloj adelantado se saltarían eventos. Sin `since` devuelve
   * la última página.
   */
  activity: (since?: string, limit = 50) =>
    apiRequest<{ asOf: string; since: string | null; data: ActivityEntry[] }>(
      `/api/v1/payments/activity?limit=${limit}${since ? `&since=${encodeURIComponent(since)}` : ""}`,
      { auth: "staff" },
    ),

  /** Lo que ha ganado en propinas quien pregunta, y de nadie más. */
  myTips: (from: string, to: string) =>
    apiRequest<MyTips>(
      `/api/v1/payments/tips/mine?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { auth: "staff" },
    ),

  /** Confirmar acredita el dinero en la cuenta: sólo tras verlo en el banco. */
  confirmClaim: (id: string) =>
    apiRequest<{ claim: StaffPaymentClaim; settlement?: PaymentResult }>(
      `/api/v1/payments/claims/${id}/confirm`,
      { method: "POST", auth: "staff" },
    ),
  /** Rechazar deja constancia y libera la referencia para volver a declararla. */
  rejectClaim: (id: string, reason?: string) =>
    apiRequest<{ claim: StaffPaymentClaim }>(`/api/v1/payments/claims/${id}/reject`, {
      method: "POST",
      auth: "staff",
      ...(reason ? { body: { reason } } : {}),
    }),
  c2pUnresolved: () =>
    apiRequest<{ data: C2PUnresolvedCharge[] }>("/api/v1/payments/c2p/unresolved", {
      auth: "staff",
    }).then((r) => r.data),
  /** Vuelve a preguntar al banco. Que no liquide nada es un desenlace normal. */
  resolveC2P: (paymentId: string) =>
    apiRequest<C2PResolution>(`/api/v1/payments/c2p/${paymentId}/resolve`, {
      method: "POST",
      auth: "staff",
    }),
};

/** Datos del restaurante: dónde cobra y con qué credenciales bancarias. */
export const account = {
  get: () => apiRequest<Account>("/api/v1/account", { auth: "staff" }),
  /**
   * El escaparate del restaurante: el nombre que lee un comensal al escanear el
   * QR, y el domicilio que encabeza su recibo. Sólo OWNER y MANAGER.
   *
   * Parcial a propósito: se manda lo que cambió. Mandar siempre los dos campos
   * es como se renombra un restaurante sin querer al corregir su dirección.
   * `fiscalAddress: ""` **borra** la dirección; omitirlo la deja como estaba.
   */
  updateProfile: (body: { name?: string; fiscalAddress?: string }) =>
    apiRequest<Account>("/api/v1/account", { method: "PATCH", auth: "staff", body }),
  /**
   * La serie autorizada. `null` significa «todavía no la ha configurado», que
   * es una respuesta y no un error: es lo que hace pintar el formulario vacío.
   */
  fiscalSeries: () =>
    apiRequest<{ fiscalSeries: FiscalSeries | null }>("/api/v1/account/fiscal-series", {
      auth: "staff",
    }).then((r) => r.fiscalSeries),
  /**
   * Sólo OWNER. Sustitución completa y no parcial: una serie a la que le falta
   * un campo no puede numerar nada.
   *
   * En cuanto ha emitido, cambiar prefijos, ancho o primer número contesta 409
   * `FISCAL_SERIES_LOCKED` con los nombres en `details.fields`.
   */
  setFiscalSeries: (body: FiscalSeriesInput) =>
    apiRequest<{ fiscalSeries: FiscalSeries }>("/api/v1/account/fiscal-series", {
      method: "PUT",
      auth: "staff",
      body,
    }).then((r) => r.fiscalSeries),
  /**
   * El RIF del emisor. Sólo OWNER.
   *
   * La forma se rechaza (400 `FISCAL_RIF_MALFORMED`); el dígito verificador
   * **no**: un RIF bien formado cuyo dígito no cuadra se guarda igual y la
   * respuesta lo dice en `checksumOk`, para avisar sin dejar a un restaurante
   * de verdad sin poder facturar por un cálculo nuestro sin contrastar.
   *
   * En cuanto se ha emitido un documento deja de poder cambiarse: 409
   * `FISCAL_RIF_LOCKED`, con el RIF bajo el que se emitió en
   * `details.issuedRif`. Y 409 `FISCAL_RIF_TAKEN` si ese contribuyente ya
   * tiene cuenta.
   */
  setRif: (rif: string) =>
    apiRequest<{ rif: string; checksumOk: boolean }>("/api/v1/account/rif", {
      method: "PUT",
      auth: "staff",
      body: { rif },
    }),
  banks: () =>
    apiRequest<{ data: BankRef[] }>("/api/v1/account/banks", { auth: "staff" }).then((r) => r.data),
  /** Los cuatro campos juntos, o {} para borrarlos: un payee a medias no cobra. */
  setPayout: (body: Record<string, string> | Record<string, never>) =>
    apiRequest<Account>("/api/v1/account/payout", { method: "PUT", auth: "staff", body }),
  providers: () =>
    apiRequest<{ data: PaymentProviderConfig[] }>("/api/v1/account/payment-providers", {
      auth: "staff",
    }).then((r) => r.data),
  /** Sólo OWNER. Las credenciales se sellan y nunca se devuelven. */
  setProvider: (provider: string, credentials: Record<string, string>) =>
    apiRequest<PaymentProviderConfig>(`/api/v1/account/payment-providers/${provider}`, {
      method: "PUT",
      auth: "staff",
      body: credentials,
    }),
  deleteProvider: (provider: string) =>
    apiRequest<void>(`/api/v1/account/payment-providers/${provider}`, {
      method: "DELETE",
      auth: "staff",
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

/* ------------------------------------------------------------ facturación */

export type FiscalTax = {
  taxCategory: "TAXABLE" | "EXEMPT" | "EXONERATED" | "NON_TAXABLE";
  vatBps: number;
  baseMinor: Money;
  vatMinor: Money;
};

export type FiscalLine = {
  position: number;
  description: string;
  /** Milésimas: 338 es 0,338 de un plato. Entero en cadena, como el dinero. */
  quantityMilli: string;
  unitPriceMinor: Money;
  taxCategory: FiscalTax["taxCategory"];
  vatBps: number;
  baseMinor: Money;
  vatMinor: Money;
};

export type FiscalInvoice = {
  id: string;
  billId: string;
  paymentId: string | null;
  documentType: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
  compensatesId: string | null;
  /** Los pone la imprenta digital autorizada. Nunca se construyen aquí. */
  documentNumber: string;
  controlNumber: string;
  provider: string;
  lineBasis: "ITEMISED" | "PRORATED" | "AGGREGATE";
  currency: "VES";
  subtotalMinor: Money;
  vatMinor: Money;
  serviceMinor: Money;
  totalMinor: Money;
  /** Nulo es consumidor final: una respuesta completa, no un dato que falte. */
  customer: { name: string | null; taxId: string | null; email: string | null } | null;
  issuedAt: string;
  /** Sólo en la lista: la mesa de la cuenta. Null si la mesa se borró. */
  tableName?: string | null;
  lines?: FiscalLine[];
  taxes?: FiscalTax[];
  /**
   * El envío por correo, sólo al leer una factura suelta.
   *
   * Nulo cuando nadie dejó dirección, que es el caso mayoritario y no un dato
   * que falte. Va aparte del documento a propósito: una factura vale igual si
   * el correo no llegó, y un fallo de envío nunca la deshace.
   */
  delivery?: {
    email: string;
    status: "PENDING" | "SENT" | "FAILED";
    attempts: number;
    sentAt: string | null;
    /** El motivo del último intento fallido, para distinguir dirección mal
     *  escrita de proveedor caído. */
    lastError: string | null;
  } | null;
};

export type FiscalRequestRow = {
  id: string;
  billId: string;
  paymentId: string | null;
  documentType: FiscalInvoice["documentType"];
  status: "PENDING" | "SENT" | "ISSUED" | "FAILED" | "UNCERTAIN";
  provider: string | null;
  attempts: number;
  lastErrorCode: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  invoiceId: string | null;
};

export type GuestContactInput = {
  email: string;
  name?: string;
  /** Sólo true si marcó una casilla que estaba vacía. Nunca por defecto. */
  marketingConsent?: boolean;
};

export type RequestInvoiceInput = {
  paymentId: string;
  name?: string;
  taxId?: string;
  email?: string;
};

export type RequestInvoiceResult = {
  status: "ISSUED" | "UNCERTAIN" | "FAILED";
  requestId: string;
  invoice: FiscalInvoice | null;
  /** Siempre true, y conviene decirlo: el cobro sigue en pie pase lo que pase. */
  paymentUnaffected: boolean;
};

/**
 * Facturación, para el panel.
 *
 * Las lecturas no las cierra el plan y nunca deben cerrarse: el deber de
 * conservar una factura emitida sobrevive a la suscripción.
 */
export const fiscalInvoices = {
  list: (params: { limit?: number; offset?: number } = {}) =>
    apiRequest<{ data: FiscalInvoice[]; limit: number; offset: number }>(
      `/api/v1/fiscal/invoices?${new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      )}`,
      { auth: "staff" },
    ),

  get: (id: string) =>
    apiRequest<FiscalInvoice>(`/api/v1/fiscal/invoices/${id}`, { auth: "staff" }),

  /** La factura en PDF: el mismo documento que recibe el cliente por correo. */
  pdf: (id: string) => staffDownload(`/api/v1/fiscal/invoices/${id}/pdf`),
  /** Las facturas de un mes («2026-09») en CSV, para el contador. Dueño y encargado. */
  exportMonth: (month: string) =>
    staffDownload(`/api/v1/fiscal/invoices/export?month=${encodeURIComponent(month)}`),

  /** La cola. `status=UNCERTAIN` es la consulta que importa. */
  requests: (params: { status?: FiscalRequestRow["status"]; limit?: number } = {}) =>
    apiRequest<{ data: FiscalRequestRow[]; limit: number; offset: number }>(
      `/api/v1/fiscal/requests?${new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      )}`,
      { auth: "staff" },
    ),

  /**
   * Preguntarle al proveedor qué pasó. **No reintenta la emisión**: consulta por
   * la clave de idempotencia, que es la única acción segura sobre algo que
   * quizá ya se emitió.
   */
  resolve: (id: string) =>
    apiRequest<{
      requestId: string;
      status: FiscalRequestRow["status"];
      stillUnknown: boolean;
      unchanged: boolean;
      invoice: FiscalInvoice | null;
    }>(`/api/v1/fiscal/requests/${id}/resolve`, { method: "POST", auth: "staff" }),
};
