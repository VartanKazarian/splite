/**
 * Las piezas de dinero que el frontend necesita de verdad: convertir precios a
 * bolívares con la tasa congelada, y los tipos que comparte con la API.
 *
 * Reglas, las del backend (src/services/money.js, migraciones 007/008):
 *  - La liquidación es SIEMPRE en VES, en céntimos, con enteros (BigInt).
 *  - El menú puede estar cotizado en VES, USD o EUR: eso es sólo la moneda de
 *    los precios, nunca lo que se cobra.
 *  - La tasa se congela al abrir la cuenta y se reutiliza en cada división.
 *  - Las tasas van escaladas x10^8 (NUMERIC(20,8)), sin coma flotante.
 *
 * **Lo que aquí no hay, a propósito: ningún cálculo de la cuenta.** Servicio,
 * IVA, IGTF, repartos y totales los calcula el servidor, y el frontend enseña
 * lo que recibe. Aquí hubo un `computeBreakdown` con el IVA y el IGTF fijos y
 * un reparto por mayor resto propios, que nada usaba: una segunda versión de
 * las cuentas que, el día que alguien la llamara, daría otro número que el
 * servidor. Se quitó (R14), con `mock-data.ts`, los datos de un prototipo que
 * tampoco importaba nadie.
 */

/** Servicio por defecto de la cuenta de ejemplo de la demo (demo-bill.ts). */
export const SERVICE_BPS = 1000; // 10%

const RATE_SCALE = 100000000n; // 10^8

export type MenuCurrency = "VES" | "USD" | "EUR";

/** payments.payment_method */
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "PAGO_MOVIL" | "SPLITE" | "OTHER";

export type StaffRole = "OWNER" | "MANAGER" | "CASHIER" | "WAITER";

/** Tasas oficiales BCV: valueDate es la fecha en que rigen, no cuándo se leyeron. */
export type FxRate = { rate: string; valueDate: string; source: "BCV" };

/** Las de la cuenta de ejemplo de la demo; una cuenta real trae la suya congelada. */
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

/** Aplica una tasa en puntos básicos: 1600 bps = 16%. Sólo la usa la demo. */
export function applyBps(minor: bigint, bps: number): bigint {
  return divideRound(minor * BigInt(bps), 10000n);
}
