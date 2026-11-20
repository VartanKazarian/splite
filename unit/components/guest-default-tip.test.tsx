import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuestBillScreen } from "../../src/components/GuestBillScreen";
import type { Bill } from "../../src/lib/api";
import { demoBill, demoSplit } from "../../src/lib/demo-bill";
import { renderGuest } from "./render";
import { signInGuest, stubApi } from "./api-stub";

/**
 * La propina que la mesa trae marcada la elige el restaurante y llega con la
 * cuenta (`defaultTipPct`). El comensal la cambia cuando quiera, y la cuenta
 * que se vuelve a pedir sola no se la cambia por debajo.
 */

const billWith = (defaultTipPct?: Bill["defaultTipPct"]): Bill => ({
  ...demoBill(),
  payee: { bankCode: "0105", bankName: "Mercantil", phone: "04121234567", holderId: "J123456789" },
  ...(defaultTipPct === undefined ? {} : { defaultTipPct }),
});

const pressed = (name: string | RegExp) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

async function toTipStep(bill: Bill) {
  const user = userEvent.setup();
  const api = stubApi({
    "GET /api/v1/guest/bill": { status: 200, body: bill },
    "GET /api/v1/guest/banks": { status: 200, body: { data: [] } },
    "POST /api/v1/guest/bill/split/preview": {
      status: 200,
      body: demoSplit(bill, "FULL", { diners: 1, mine: {}, amountMinor: "0" }),
    },
    "POST /api/v1/guest/bill/holds": {
      status: 201,
      body: { id: "h", amountVes: "1", expiresAt: new Date(Date.now() + 3.6e6).toISOString() },
    },
  });
  renderGuest(<GuestBillScreen />);
  await user.click(await screen.findByRole("button", { name: /Pagar la cuenta/ }));
  await screen.findByRole("button", { name: "Sin propina" });
  return { user, api };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  signInGuest();
});
afterEach(cleanup);

describe("propina sugerida por el restaurante", () => {
  test("«Sin propina» marcada cuando el restaurante lo pide", async () => {
    await toTipStep(billWith(0));
    await waitFor(() => expect(pressed("Sin propina")).toBe("true"));
    expect(pressed("10%")).toBe("false");
  });

  test("el 15 % del restaurante, y el comensal la cambia", async () => {
    const { user } = await toTipStep(billWith(15));
    await waitFor(() => expect(pressed("15%")).toBe("true"));
    await user.click(screen.getByRole("button", { name: "20%" }));
    expect(pressed("20%")).toBe("true");
    expect(pressed("15%")).toBe("false");
  });

  test("sin ajuste del restaurante, 10 %, como hasta ahora", async () => {
    await toTipStep(billWith());
    expect(pressed("10%")).toBe("true");
  });
});
