import { BCV_RATES, applyBps, applyRate, parseRate } from "./fiscal";
import type { Bill, BillItem, SplitMode, SplitPreview } from "./api";

/** Cuenta ficticia para que cualquiera pruebe el flujo de invitado sin QR ni backend. */
const VAT_BPS = 1600;
const SERVICE_BPS = 1000;
const RATE = BCV_RATES.USD;

const line = (id: string, name: string, quantity: number, unit: number): BillItem => ({
  id,
  billId: "demo-bill",
  productId: null,
  name,
  unitPriceMinor: String(Math.round(unit * 100)),
  currency: "USD",
  quantity,
  subtotalMinor: String(Math.round(unit * 100) * quantity),
});

export function demoBill(): Bill {
  const items = [
    line("d1", "Tequeños (6u)", 1, 8),
    line("d2", "Hamburguesa de la casa", 2, 15),
    line("d3", "Pabellón criollo", 1, 16),
    line("d4", "Cerveza artesanal", 3, 5),
    line("d5", "Papelón con limón", 2, 3),
  ];
  const subtotal = items.reduce((a, i) => a + BigInt(i.subtotalMinor), 0n);
  const vat = applyBps(subtotal, VAT_BPS);
  const service = applyBps(subtotal, SERVICE_BPS);
  const total = subtotal + vat + service;
  const totalVes = applyRate(total, parseRate(RATE.rate));
  return {
    id: "demo-bill",
    tableId: "demo",
    status: "OPEN",
    currency: "USD",
    subtotalMinor: subtotal.toString(),
    vatBps: VAT_BPS,
    vatMinor: vat.toString(),
    serviceChargeBps: SERVICE_BPS,
    serviceChargeMinor: service.toString(),
    totalDue: total.toString(),
    totalDueVes: totalVes.toString(),
    amountPaidVes: "0",
    remainingVes: totalVes.toString(),
    fxRateVesPerUnit: RATE.rate,
    fxValueDate: RATE.valueDate,
    itemCount: items.length,
    items,
  };
}

/** Reparto por resto mayor (Hare), igual que el servidor, pero local. */
function hare(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return weights.map(() => 0n);
  const base = weights.map((w) => (total * w) / sum);
  let rest = total - base.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of order) {
    if (rest <= 0n) break;
    base[i] = base[i]! + 1n;
    rest -= 1n;
  }
  return base;
}

export function demoSplit(
  bill: Bill,
  mode: SplitMode,
  opts: { diners: number; mine: string[]; amountMinor: string },
): SplitPreview {
  const outstanding = BigInt(bill.remainingVes);
  const rate = parseRate(bill.fxRateVesPerUnit ?? RATE.rate);
  const alloc = (id: string, amount: bigint) => ({
    participantId: id,
    name: null,
    amountVes: amount.toString(),
    usdReference: null,
  });

  let allocations: SplitPreview["allocations"];
  if (mode === "FULL") {
    allocations = [alloc("me", outstanding)];
  } else if (mode === "EQUAL") {
    const n = Math.max(2, opts.diners);
    const parts = hare(outstanding, Array.from({ length: n }, () => 1n));
    allocations = parts.map((p, i) => alloc(`p${i + 1}`, p));
  } else if (mode === "ITEMS") {
    const mineMinor = (bill.items ?? [])
      .filter((i) => opts.mine.includes(i.id))
      .reduce((a, i) => a + BigInt(i.subtotalMinor), 0n);
    const subtotal = BigInt(bill.subtotalMinor) || 1n;
    // Impuestos y servicio se prorratean sobre lo consumido.
    const share = applyRate((mineMinor * BigInt(bill.totalDue)) / subtotal, rate);
    const capped = share > outstanding ? outstanding : share;
    allocations = [alloc("me", capped), alloc("others", outstanding - capped)];
  } else {
    const wanted = BigInt(opts.amountMinor || "0");
    const capped = wanted > outstanding ? outstanding : wanted;
    allocations = [alloc("me", capped), alloc("others", outstanding - capped)];
  }

  const totalAllocated = allocations.reduce((a, x) => a + BigInt(x.amountVes), 0n);
  return {
    mode,
    currency: "VES",
    outstandingVes: outstanding.toString(),
    totalAllocatedVes: totalAllocated.toString(),
    allocations,
  };
}
