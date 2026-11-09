import { test, expect, arriveAtBill } from "./support/fixtures";
import { api, type Auth } from "./support/api";
import { openGuestSession } from "./support/seed";

/**
 * 8. «Ana está pagando»: dos comensales, dos teléfonos, una cuenta.
 *
 * Ana pulsa «Pagar» y se va a su banco. Luis, en la misma mesa, abre el pago un
 * momento después: no debe ver los datos para transferir, sino que alguien ya
 * lo está pagando. Si Ana vuelve atrás, Luis puede pagarlo.
 *
 * Necesita una API con reservas (`heldVes` en la cuenta del invitado). La CI
 * de este repositorio levanta el `main` del backend; hasta que ese cambio esté
 * allí, esto se salta en vez de fallar.
 */
async function skipUnlessApiHolds(guest: Auth & { kind: "guest" }) {
  const bill = await api.get<Record<string, unknown>>("/api/v1/guest/bill", guest);
  test.skip(!("heldVes" in bill), "la API todavía no tiene reservas de pago");
}

test("quien llega segundo ve que otro está pagando, y no los datos para transferir", async ({
  browser,
  seed,
}) => {
  const table = await seed("reserva");
  await skipUnlessApiHolds(await openGuestSession(table.qrToken));

  const ana = await browser.newPage();
  const luis = await browser.newPage();

  await arriveAtBill(ana, table);
  await ana.getByTestId("guest-pay-full").click();
  await ana.getByTestId("guest-continue").click();
  await expect(ana.getByTestId("guest-hold-held")).toBeVisible();

  await arriveAtBill(luis, table);
  await luis.getByTestId("guest-pay-full").click();
  await luis.getByTestId("guest-continue").click();
  await expect(luis.getByTestId("guest-hold-blocked")).toBeVisible();
  await expect(luis.getByTestId("guest-payee-done")).toHaveCount(0);
  await luis.screenshot({ path: "test-results/08-luis-blocked.png", fullPage: true });

  // Quien ya transfirió de todos modos sigue pudiendo avisar.
  await luis.getByTestId("guest-hold-paid-anyway").click();
  await expect(luis.getByTestId("guest-pay-tab-claim")).toHaveAttribute("aria-pressed", "true");

  // Ana se arrepiente y vuelve atrás: la parte queda libre para Luis.
  await ana.getByTestId("guest-step-back").click();
  await expect(ana.getByTestId("guest-hold-held")).toHaveCount(0);
  await luis.getByTestId("guest-pay-tab-payee").click();
  await expect(luis.getByTestId("guest-hold-held")).toBeVisible({ timeout: 20_000 });
  await expect(luis.getByTestId("guest-payee-done")).toBeVisible();
  await ana.close();
  await luis.close();
});
