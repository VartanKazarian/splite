import { API_BASE_URL, ApiError, type ApiErrorBody } from "@/lib/api";

/**
 * El cliente de la consola de Splite (/admin).
 *
 * Aparte del de los restaurantes a propósito: otra sesión, otro almacén y otra
 * cabecera. La sesión vive en `sessionStorage` y no en `localStorage`: se va al
 * cerrar la pestaña, que es lo que se quiere de una cuenta que ve a todos los
 * clientes. Tampoco hay refresco: a las ocho horas se vuelve a entrar.
 */

export type OperatorRole = "ADMIN" | "SUPPORT";

export type Operator = {
  id: string;
  email: string;
  displayName: string;
  role: OperatorRole;
};

export type OperatorSession = {
  accessToken: string;
  expiresAt: number;
  operator: Operator;
};

const KEY = "splite.operator.session";

export const operatorSession = {
  get(): OperatorSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as OperatorSession;
      if (!s.accessToken || s.expiresAt < Date.now()) {
        window.sessionStorage.removeItem(KEY);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  },
  set(s: { accessToken: string; expiresIn: number; operator: Operator }) {
    try {
      window.sessionStorage.setItem(
        KEY,
        JSON.stringify({
          accessToken: s.accessToken,
          expiresAt: Date.now() + s.expiresIn * 1000,
          operator: s.operator,
        }),
      );
    } catch {
      /* sin almacenamiento no hay sesión: el login lo dirá */
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* nada que borrar */
    }
  },
};

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const s = operatorSession.get();
  if (s) headers["Authorization"] = `Bearer ${s.accessToken}`;

  const res = await fetch(`${API_BASE_URL}/api/v1/admin${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const payload = (await res.json().catch(() => null)) as { error?: ApiErrorBody } | T | null;
  if (!res.ok) {
    const body = (payload as { error?: ApiErrorBody } | null)?.error ?? {
      code: "UNKNOWN_ERROR",
      message: `Request failed with status ${res.status}`,
      details: {},
      requestId: "",
    };
    // Sesión caducada o desactivada: fuera, y la pantalla lleva al login.
    if (res.status === 401 && s) operatorSession.clear();
    throw new ApiError(res.status, body);
  }
  return payload as T;
}

export type ClientState =
  "TRIAL" | "TRIAL_EXPIRED" | "ACTIVE" | "OVERDUE" | "SUSPENDED" | "CANCELLED";

export type Tier = "TRIAL" | "STARTER" | "PRO" | "ENTERPRISE";
export type Cycle = "MONTHLY" | "ANNUAL";
export type SubscriptionStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";
export type PaymentMethod = "PAGO_MOVIL" | "TRANSFER" | "USD_CASH" | "ZELLE" | "OTHER";

export type AdminClient = {
  id: string;
  name: string;
  rif: string | null;
  ownerEmail: string | null;
  tier: Tier;
  trialEndsAt: string | null;
  state: ClientState;
  subscriptionStatus: SubscriptionStatus;
  billingCycle: Cycle;
  customPriceUsd: string | null;
  listPriceUsd: string | null;
  priceUsd: string | null;
  monthlyValueUsd: string | null;
  balanceUsd: string;
  lastActivityAt: string | null;
  createdAt: string;
  notes: string | null;
};

export type AdminCharge = {
  id: string;
  restaurantId: string;
  restaurantName?: string;
  tier: string;
  billingCycle: Cycle;
  periodStart: string;
  periodEnd: string;
  amountUsd: string;
  paidUsd: string;
  remainingUsd: string;
  dueOn: string;
  status: "OPEN" | "PAID" | "VOID";
  overdue: boolean;
  paidAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type AdminPayment = {
  id: string;
  restaurantId: string;
  chargeId: string | null;
  method: PaymentMethod;
  currency: "VES" | "USD";
  amount: string;
  fxRate: string | null;
  appliedUsd: string;
  reference: string | null;
  receivedOn: string;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
};

export type ClientDetail = {
  client: AdminClient;
  charges: AdminCharge[];
  payments: AdminPayment[];
  usage: {
    bills30d: number;
    collectedVes30d: string;
    tables: number;
    staff: number;
    products: number;
    bankConnections: number;
  };
  setup: { menuLoaded: boolean; tablesCreated: boolean; rifSet: boolean; bankConnected: boolean };
  history: {
    action: string;
    details: Record<string, unknown> | null;
    operatorEmail: string | null;
    at: string;
  }[];
};

export type PlanPrice = {
  id: string;
  tier: Exclude<Tier, "TRIAL">;
  billingCycle: Cycle;
  amountUsd: string;
  effectiveFrom: string;
  createdAt: string;
};

type SessionResponse = { accessToken: string; expiresIn: number; operator: Operator };

export const admin = {
  login: (email: string, password: string, code: string) =>
    call<SessionResponse>("/auth/login", { method: "POST", body: { email, password, code } }),
  setupStart: (token: string) =>
    call<{ email: string; displayName: string; secret: string; otpauthUri: string }>(
      "/auth/setup/start",
      { method: "POST", body: { token } },
    ),
  setupComplete: (token: string, password: string, code: string) =>
    call<SessionResponse>("/auth/setup/complete", {
      method: "POST",
      body: { token, password, code },
    }),
  me: () => call<{ operator: Operator }>("/me"),
  clients: (params: { q?: string | undefined; state?: ClientState | "" } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.state) qs.set("state", params.state);
    const suffix = qs.toString() ? `?${qs}` : "";
    return call<{
      data: AdminClient[];
      summary: {
        total: number;
        byState: Partial<Record<ClientState, number>>;
        monthlyRecurringUsd: string;
        outstandingUsd: string;
      };
    }>(`/clients${suffix}`);
  },
  client: (id: string) => call<ClientDetail>(`/clients/${id}`),
  changePlan: (
    id: string,
    body: { tier: Tier; trialDays?: number | null; force?: boolean; note?: string | null },
  ) =>
    call<{ tier: Tier; trialEndsAt: string | null; gained: string[]; lost: string[] }>(
      `/clients/${id}/plan`,
      { method: "PATCH", body },
    ),
  updateSubscription: (
    id: string,
    body: {
      billingCycle?: Cycle;
      customPriceUsd?: string | null;
      status?: SubscriptionStatus;
      notes?: string | null;
      reason?: string | null;
    },
  ) => call<ClientDetail>(`/clients/${id}/subscription`, { method: "PATCH", body }),
  createCharge: (id: string, periodStart?: string | null) =>
    call<{ charge: AdminCharge }>(`/clients/${id}/charges`, {
      method: "POST",
      body: { periodStart: periodStart || null },
    }),
  recordPayment: (
    id: string,
    body: {
      chargeId: string | null;
      method: PaymentMethod;
      currency: "VES" | "USD";
      amount: string;
      fxRate?: string | null;
      reference?: string | null;
      receivedOn: string;
      notes?: string | null;
      settle?: boolean;
    },
  ) =>
    call<{ payment: AdminPayment; charge: AdminCharge | null }>(`/clients/${id}/payments`, {
      method: "POST",
      body,
    }),
  charges: (status: "" | "OPEN" | "OVERDUE" | "PAID" | "VOID" = "") =>
    call<{ data: AdminCharge[] }>(`/charges${status ? `?status=${status}` : ""}`),
  voidCharge: (chargeId: string, reason: string) =>
    call<{ charge: AdminCharge }>(`/charges/${chargeId}/void`, {
      method: "POST",
      body: { reason },
    }),
  prices: () => call<{ current: PlanPrice[]; history: PlanPrice[] }>("/prices"),
  setPrice: (body: {
    tier: Exclude<Tier, "TRIAL">;
    billingCycle: Cycle;
    amountUsd: string;
    effectiveFrom?: string | null;
  }) => call<{ price: PlanPrice }>("/prices", { method: "POST", body }),
};

/** Etiquetas en español para lo que la API manda en mayúsculas. */
export const STATE_LABEL: Record<ClientState, string> = {
  TRIAL: "En prueba",
  TRIAL_EXPIRED: "Prueba vencida",
  ACTIVE: "Al día",
  OVERDUE: "Con deuda vencida",
  SUSPENDED: "Suspendido",
  CANCELLED: "Cancelado",
};

export const STATE_TONE: Record<ClientState, string> = {
  TRIAL: "border-sky-500/40 bg-sky-500/10 text-sky-800",
  TRIAL_EXPIRED: "border-amber-500/50 bg-amber-500/10 text-amber-800",
  ACTIVE: "border-primary/40 bg-primary/10 text-primary",
  OVERDUE: "border-destructive/40 bg-destructive/10 text-destructive",
  SUSPENDED: "border-border bg-secondary text-muted-foreground",
  CANCELLED: "border-border bg-secondary text-muted-foreground line-through",
};

export const CYCLE_LABEL: Record<Cycle, string> = { MONTHLY: "Mensual", ANNUAL: "Anual" };

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  PAGO_MOVIL: "Pago móvil",
  TRANSFER: "Transferencia",
  USD_CASH: "Efectivo $",
  ZELLE: "Zelle",
  OTHER: "Otro",
};

export const ACTION_LABEL: Record<string, string> = {
  PLAN_CHANGED: "Cambio de plan",
  SUBSCRIPTION_UPDATED: "Suscripción actualizada",
  CHARGE_CREATED: "Cargo generado",
  CHARGE_VOIDED: "Cargo anulado",
  PAYMENT_RECORDED: "Pago registrado",
};

/** Hoy en Caracas, AAAA-MM-DD: la fecha por defecto de un pago. */
export function caracasToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "2026-09-25" → "25 sept. 2026", sin que la zona horaria lo mueva de día. */
export function formatDay(isoDay: string | null): string {
  if (!isoDay) return "—";
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("es-VE", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
