/**
 * Cálculo fiscal en unidades menores (céntimos), con enteros — igual que el
 * backend (splite-backend/src/services/money.js): nada de coma flotante.
 *
 * Conceptos incluidos:
 *  - Base imponible (subtotal de productos)
 *  - Servicio (10% sugerido, cargo del restaurante)
 *  - IVA 16% sobre base + servicio
 *  - IGTF 3% cuando el pago se hace en divisas
 *  - Propina voluntaria (no genera IVA)
 *  - Equivalente en VES a la tasa BCV congelada al abrir la cuenta
 */

export const SERVICE_BPS = 1000; // 10%
export const IVA_BPS = 1600; // 16%
export const IGTF_BPS = 300; // 3%

/** Tasa BCV de referencia (VES por USD), escalada x10^8 como en el backend. */
export const BCV_RATE = 245.8;

const toMinor = (v: number) => BigInt(Math.round(v * 100));

function divideRound(numerator: bigint, denominator: bigint): bigint {
  if (numerator >= 0n) return (numerator + denominator / 2n) / denominator;
  return -((-numerator + denominator / 2n) / denominator);
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

export type Breakdown = {
  base: bigint;
  service: bigint;
  iva: bigint;
  igtf: bigint;
  tip: bigint;
  total: bigint;
  totalVes: bigint;
};

export function computeBreakdown(opts: {
  /** base imponible en USD (número decimal) */
  base: number;
  serviceBps?: number;
  tipBps?: number;
  /** el pago se liquida en divisas → aplica IGTF */
  foreignCurrency?: boolean;
}): Breakdown {
  const base = toMinor(opts.base);
  const service = applyBps(base, opts.serviceBps ?? SERVICE_BPS);
  const iva = applyBps(base + service, IVA_BPS);
  const taxed = base + service + iva;
  const igtf = opts.foreignCurrency ? applyBps(taxed, IGTF_BPS) : 0n;
  const tip = applyBps(base, opts.tipBps ?? 0);
  const total = taxed + igtf + tip;
  const totalVes = divideRound(total * BigInt(Math.round(BCV_RATE * 1e8)), 100000000n);
  return { base, service, iva, igtf, tip, total, totalVes };
}

/** Formatea unidades menores como monto. */
export const fmt = (minor: bigint) => (Number(minor) / 100).toFixed(2);

export const fmtVes = (minor: bigint) =>
  (Number(minor) / 100).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
