import type {
  BillStatus,
  MenuCurrency,
  PaymentMethod,
  PaymentStatus,
  PayerType,
  StaffRole,
  TenderCurrency,
} from "./fiscal";
import { BCV_RATES, applyRate, parseRate } from "./fiscal";

export type BillItem = {
  id: string;
  name: { es: string; en: string };
  /** precio en unidades menores de la moneda del menú */
  priceMinor: bigint;
  paid?: boolean;
};

export type Payment = {
  id: string;
  amountVes: bigint;
  method: PaymentMethod;
  status: PaymentStatus;
  payerType: PayerType;
  tender?: { amount: bigint; currency: TenderCurrency; fxRate: string };
  idempotencyKey: string;
  at: string;
};

export type TableInfo = {
  id: string;
  number: number;
  seats: number;
  /** una mesa tiene como máximo una cuenta OPEN (índice parcial del backend) */
  bill: {
    id: string;
    status: BillStatus;
    /** tasa congelada al abrir la cuenta */
    fxRateVesPerUnit: string | null;
    fxValueDate: string | null;
    openedAt: string;
    guests: number;
    items: BillItem[];
    payments: Payment[];
  } | null;
};

/** El restaurante cotiza su menú en una moneda; la liquidación siempre es VES. */
export const restaurant = {
  id: "9a1e0c34-0000-4000-8000-000000000001",
  name: "La Cava del Ávila",
  city: "Caracas",
  menuCurrency: "USD" as MenuCurrency,
};

export const staff: { name: string; email: string; role: StaffRole }[] = [
  { name: "Vartan K.", email: "owner@lacava.ve", role: "OWNER" },
  { name: "Daniela R.", email: "gerencia@lacava.ve", role: "MANAGER" },
  { name: "José M.", email: "caja@lacava.ve", role: "CASHIER" },
  { name: "Andrea P.", email: "salon@lacava.ve", role: "WAITER" },
];

const USD = BCV_RATES.USD;
const rate = USD.rate;

const m = (n: number) => BigInt(Math.round(n * 100));

export const tables: TableInfo[] = [
  {
    id: "15",
    number: 15,
    seats: 4,
    bill: {
      id: "b-15-0001",
      status: "OPEN",
      fxRateVesPerUnit: rate,
      fxValueDate: USD.valueDate,
      openedAt: "19:42",
      guests: 3,
      items: [
        { id: "i1", name: { es: "Hamburguesa de la casa", en: "House burger" }, priceMinor: m(15) },
        { id: "i2", name: { es: "Pizza margarita", en: "Margherita pizza" }, priceMinor: m(18) },
        { id: "i3", name: { es: "Refresco", en: "Soft drink" }, priceMinor: m(4) },
        { id: "i4", name: { es: "Cerveza artesanal", en: "Craft beer" }, priceMinor: m(5) },
        { id: "i5", name: { es: "Tequeños (6u)", en: "Tequeños (6)" }, priceMinor: m(8) },
      ],
      payments: [],
    },
  },
  {
    id: "7",
    number: 7,
    seats: 2,
    bill: {
      id: "b-07-0014",
      status: "OPEN",
      fxRateVesPerUnit: rate,
      fxValueDate: USD.valueDate,
      openedAt: "20:05",
      guests: 2,
      items: [
        {
          id: "j1",
          name: { es: "Pabellón criollo", en: "Pabellón criollo" },
          priceMinor: m(16),
          paid: true,
        },
        {
          id: "j2",
          name: { es: "Arepa reina pepiada", en: "Reina pepiada arepa" },
          priceMinor: m(9),
        },
        { id: "j3", name: { es: "Papelón con limón", en: "Papelón lemonade" }, priceMinor: m(3) },
      ],
      payments: [
        {
          id: "p-7a",
          amountVes: applyRate(m(20.42), parseRate(rate)),
          method: "PAGO_MOVIL",
          status: "SUCCEEDED",
          payerType: "GUEST",
          idempotencyKey: "5f2c-9a10-1",
          at: "20:31",
        },
      ],
    },
  },
  {
    id: "3",
    number: 3,
    seats: 6,
    bill: {
      id: "b-03-0009",
      status: "OPEN",
      fxRateVesPerUnit: rate,
      fxValueDate: USD.valueDate,
      openedAt: "20:18",
      guests: 5,
      items: [
        { id: "k1", name: { es: "Parrilla mixta", en: "Mixed grill" }, priceMinor: m(42) },
        { id: "k2", name: { es: "Ensalada césar", en: "Caesar salad" }, priceMinor: m(11) },
        { id: "k3", name: { es: "Botella de vino", en: "Bottle of wine" }, priceMinor: m(28) },
        { id: "k4", name: { es: "Postre del día", en: "Dessert of the day" }, priceMinor: m(7) },
      ],
      payments: [
        {
          id: "p-3a",
          amountVes: applyRate(m(30), parseRate(rate)),
          method: "CASH",
          status: "SUCCEEDED",
          payerType: "STAFF",
          tender: { amount: m(30), currency: "USD", fxRate: rate },
          idempotencyKey: "till-3-0009-1",
          at: "21:02",
        },
        {
          id: "p-3b",
          amountVes: applyRate(m(25), parseRate(rate)),
          method: "CARD",
          status: "PENDING",
          payerType: "GUEST",
          idempotencyKey: "6b81-2f44-2",
          at: "21:07",
        },
      ],
    },
  },
  { id: "1", number: 1, seats: 2, bill: null },
  { id: "2", number: 2, seats: 4, bill: null },
  { id: "9", number: 9, seats: 4, bill: null },
];

export const getTable = (id: string) => tables.find((t) => t.id === id);

/** Suma pendiente en unidades menores del menú. */
export const dueMinor = (t: TableInfo) =>
  (t.bill?.items ?? []).filter((i) => !i.paid).reduce((a, i) => a + i.priceMinor, 0n);

export const stats = {
  sales: "1.284",
  tip: "12%",
  open: String(tables.filter((t) => t.bill?.status === "OPEN").length),
  tickets: "47",
};
