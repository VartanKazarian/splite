/**
 * Modelo monetario del prototipo, alineado con splite-backend.
 *
 * Reglas tomadas del backend (src/services/money.js, split.js, migración 007/008):
 *  - La liquidación es SIEMPRE en VES, en céntimos, con enteros (BigInt).
 *  - El menú puede estar cotizado en VES, USD o EUR: eso es sólo la moneda de
 *    los precios, nunca lo que se cobra.
 *  - La tasa se congela al abrir la cuenta (fx_rate_ves_per_unit) y se reutiliza
 *    en cada división: el total cotizado no se mueve mientras el cliente come.
 *  - Las tasas se representan escaladas x10^8 (NUMERIC(20,8)), sin coma flotante.
 *  - Los repartos usan mayor resto (Hare) para que las partes sumen el total.
 *
 * Conceptos fiscales venezolanos que el frontend presenta sobre esa base:
 *  base imponible, servicio 10%, IVA 16%, IGTF 3% (sólo tender en divisas),
 *  propina voluntaria (no gravada).
 */

export const SERVICE_BPS = 1000; // 10%
export const IVA_BPS = 1600; // 16%
export const IGTF_BPS = 300; // 3%

export const RATE_SCALE = 100000000n; // 10^8

export type MenuCurrency = "VES" | "USD" | "EUR";
export type TenderCurrency = MenuCurrency;

/** Estados de cuenta del backend (bills.status). */
export type BillStatus = "OPEN" | "CLOSED" | "VOID";

/** payments.payment_method */
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "PAGO_MOVIL" | "SPLITE" | "OTHER";

/** payments.status y sus transiciones legales (migración 007). */
export type PaymentStatus =
  "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export type PayerType = "STAFF" | "GUEST" | "SYSTEM";
export type StaffRole = "OWNER" | "MANAGER" | "CASHIER" | "WAITER";

/** Tasas oficiales BCV: valueDate es la fecha en que rigen, no cuándo se leyeron. */
export type FxRate = { rate: string; valueDate: string; source: "BCV" };

export const BCV_RATES: Record<"USD" | "EUR", FxRate> = {
  USD: { rate: "757.5406", valueDate: "2026-08-10", source: "BCV" },
  EUR: { rate: "875.2169568", valueDate: "2026-08-10", source: "BCV" },
};

/** "757.5406" -> 75754060000n (escala 10^8, truncando como NUMERIC(20,8)). */
export function parseRate(value: string): bigint {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`FX rate inválida: ${value}`);
  const [whole, fraction = ""] = text.split(".");
  const padded = (fraction + "00000000").slice(0, 8);
  return BigInt(whole!) * RATE_SCALE + BigInt(padded);
}

function divideRound(numerator: bigint, denominator: bigint): bigint {
  if (numerator >= 0n) return (numerator + denominator / 2n) / denominator;
  return -((-numerator + denominator / 2n) / denominator);
}

/** Unidades menores en moneda del menú -> céntimos VES, a tasa escalada x10^8. */
export function applyRate(minorUnits: bigint, scaledRate: bigint): bigint {
  return divideRound(minorUnits * scaledRate, RATE_SCALE);
}

/** Aplica una tasa en puntos básicos: 1600 bps = 16%. */
export function applyBps(minor: bigint, bps: number): bigint {
  return divideRound(minor * BigInt(bps), 10000n);
}

/** Reparto exacto por mayor resto (Hare) — las partes suman el total. */
export function allocate(total: bigint, shares: number[]): bigint[] {
  const weights = shares.map((s) => BigInt(s));
  const sum = weights.reduce((a, b) => a + b, 0n);
  const parts = weights.map((w) => (total * w) / sum);
  const rem = weights.map((w, index) => ({ index, r: (total * w) % sum }));
  let leftover = total - parts.reduce((a, b) => a + b, 0n);
  rem.sort((a, b) => (a.r === b.r ? a.index - b.index : b.r > a.r ? 1 : -1));
  for (let i = 0; leftover > 0n; i++, leftover--) {
    parts[rem[i % rem.length]!.index]! += 1n;
  }
  return parts;
}

/** División en partes iguales entre n comensales. */
export const splitEvenly = (total: bigint, diners: number) =>
  allocate(total, Array(Math.max(1, diners)).fill(1));

/**
 * Referencia en la moneda del menú a partir de céntimos VES.
 * Devuelve null si no hay tasa congelada: se omite antes que mostrar un número falso.
 */
export function quoteReference(minorUnitsVes: bigint, scaledRate: bigint | null): string | null {
  if (!scaledRate || scaledRate <= 0n) return null;
  return (Number(minorUnitsVes) / 100 / (Number(scaledRate) / 1e8)).toFixed(2);
}

export type Breakdown = {
  /** todos los importes en céntimos VES (liquidación autoritativa) */
  base: bigint;
  service: bigint;
  iva: bigint;
  igtf: bigint;
  tip: bigint;
  total: bigint;
};

/**
 * Desglose de lo que va a pagar el comensal.
 * @param baseVes base imponible en céntimos VES (ya convertida a la tasa congelada)
 * @param tenderCurrency lo que entrega el cliente; si no es VES aplica IGTF 3%
 */
export function computeBreakdown(opts: {
  baseVes: bigint;
  serviceBps?: number;
  tipBps?: number;
  tenderCurrency?: TenderCurrency;
}): Breakdown {
  const base = opts.baseVes;
  const service = applyBps(base, opts.serviceBps ?? SERVICE_BPS);
  const iva = applyBps(base + service, IVA_BPS);
  const taxed = base + service + iva;
  const igtf =
    opts.tenderCurrency && opts.tenderCurrency !== "VES" ? applyBps(taxed, IGTF_BPS) : 0n;
  const tip = applyBps(base, opts.tipBps ?? 0);
  return { base, service, iva, igtf, tip, total: taxed + igtf + tip };
}

/** Formatea céntimos VES: "12.345,67". */
export const fmtVes = (minor: bigint) =>
  (Number(minor) / 100).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Formatea unidades menores de una moneda cotizada: "18.00". */
export const fmt = (minor: bigint) => (Number(minor) / 100).toFixed(2);

export const CURRENCY_SYMBOL: Record<MenuCurrency, string> = {
  VES: "Bs",
  USD: "$",
  EUR: "€",
};
