import { api, loginOwner, type Auth } from "./api";

/**
 * El atrezzo: una mesa con una cuenta abierta y algo consumido, más el código
 * QR que lleva a ella.
 *
 * Cada prueba monta el suyo. Compartir una mesa entre pruebas ahorraría unos
 * segundos y las volvería dependientes del orden: quien pague primero cierra
 * la cuenta que la siguiente esperaba encontrar abierta.
 */

export type SeedLine = { name: string; priceMinorUnits: string; quantity: number };

export type BillItem = {
  id: string;
  name: string;
  quantity: number;
  unitPriceMinor: string;
  subtotalMinor: string;
};

export type Bill = {
  id: string;
  status: string;
  currency: string;
  totalDueVes: string;
  amountPaidVes: string;
  remainingVes: string;
};

export type Seed = {
  auth: Auth & { kind: "staff" };
  tableId: string;
  tableName: string;
  billId: string;
  qrToken: string;
  /** Lo que se pone en la barra de direcciones para «escanear» la mesa. */
  guestPath: string;
  items: BillItem[];
  bill: Bill;
};

const DEFAULT_LINES: SeedLine[] = [
  { name: "arepa", priceMinorUnits: "1200", quantity: 1 },
  { name: "jugo", priceMinorUnits: "500", quantity: 2 },
];

export async function seedOpenBill(
  label: string,
  lines: SeedLine[] = DEFAULT_LINES,
): Promise<Seed> {
  const auth = await loginOwner();
  const tag = `smoke-${label}-${Date.now().toString(36)}`;

  const table = await api.post<{ id: string; name: string }>("/api/v1/tables", { name: tag }, auth);

  const bill = await api.post<Bill>(
    "/api/v1/bills",
    // Cero y no el total: el total lo calcula el servidor a partir de las
    // líneas, con su IVA y su servicio. Mandarlo desde aquí sería inventarse
    // la cuenta que la prueba dice comprobar.
    { tableId: table.id, totalDueMinorUnits: "0" },
    auth,
  );

  for (const line of lines) {
    const product = await api.post<{ id: string }>(
      "/api/v1/menu/products",
      { name: `${tag} ${line.name}`, priceMinorUnits: line.priceMinorUnits },
      auth,
    );
    await api.post(
      `/api/v1/bills/${bill.id}/items`,
      { productId: product.id, quantity: line.quantity },
      auth,
    );
  }

  const [items, finalBill, qr] = await Promise.all([
    api.get<{ data: BillItem[] }>(`/api/v1/bills/${bill.id}/items`, auth),
    api.get<Bill>(`/api/v1/bills/${bill.id}`, auth),
    api.get<{ token: string }>(`/api/v1/guest/tables/${table.id}/qr`, auth),
  ]);

  return {
    auth,
    tableId: table.id,
    tableName: table.name,
    billId: bill.id,
    qrToken: qr.token,
    guestPath: `/t?qr=${encodeURIComponent(qr.token)}`,
    items: items.data,
    bill: finalBill,
  };
}

/** Una sesión de invitado sin pasar por el navegador, para lo que no se prueba. */
export async function openGuestSession(qrToken: string): Promise<Auth & { kind: "guest" }> {
  const session = await api.post<{ sessionId: string; guestToken: string }>(
    "/api/v1/guest/sessions",
    { qrToken },
  );
  return { kind: "guest", sessionId: session.sessionId, guestToken: session.guestToken };
}

export type Claim = { id: string; status: string; amountVes: string };

export async function declareClaim(
  guest: Auth & { kind: "guest" },
  input: { amountVes: string; reference: string },
): Promise<Claim> {
  return api.post<Claim>("/api/v1/guest/bill/payment-claims", input, guest);
}

export async function readBill(seed: Seed): Promise<Bill> {
  return api.get<Bill>(`/api/v1/bills/${seed.billId}`, seed.auth);
}
