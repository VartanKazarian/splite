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
export type QrContext = {
  restaurant: { id: string; name: string; menuCurrency: MenuCurrency };
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

  /** Aviso de pago: crea un claim PENDING, nunca cierra ni paga la cuenta. */
  paymentClaim: (body: PaymentClaimInput) =>
    apiRequest<PaymentClaim>("/api/v1/guest/bill/payment-claims", {
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
  itemCount?: number;
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
  declaredAt?: string | null;
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
  byMethod?: { method: string; payments: number; tipsVes: Money }[];
};

export type PaymentClaimInput = {

  amountVes: Money;
  reference: string;
  phoneOrigin?: string;
  bankOrigin?: string;
  /** Atribuye el aviso a una parte del reparto persistente. */
  splitParticipantId?: string;
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
  };
  createdAt?: string;
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
  createdAt?: string;
  updatedAt?: string;
};

/** Un producto tal y como lo ve un comensal: sin `active`, con su sección. */
export type PublicProduct = {
  id: string;
  name: string;
  description: string | null;
  priceMinorUnits: Money;
  currency: MenuCurrency;
  categoryId: string | null;
  categoryName: string | null;
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
  restaurant: { id: string; name: string; menuCurrency: MenuCurrency };
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
    apiRequest<{ user: StaffMember; sessionsRevoked: number }>(
      `/api/v1/account/users/${id}`,
      { method: "PATCH", auth: "staff", body },
    ),

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
    apiRequest<{ data: MenuCategory[]; uncategorisedCount: number }>(
      "/api/v1/menu/categories",
      { auth: "staff" },
    ),

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
  }) =>
    apiRequest<Product>("/api/v1/menu/products", { method: "POST", auth: "staff", body }),
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
    apiRequest<void>(
      `/api/v1/menu/products/${id}${permanent ? "?permanent=true" : ""}`,
      { method: "DELETE", auth: "staff" },
    ),
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
  pay: (id: string, amountMinorUnits: Money, idempotencyKey: string, splitParticipantId?: string) =>
    apiRequest<PaymentResult>(`/api/v1/bills/${id}/payments`, {
      method: "POST",
      auth: "staff",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        billId: id,
        amountMinorUnits,
        currency: "VES",
        idempotencyKey,
        ...(splitParticipantId ? { splitParticipantId } : {}),
      },
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
