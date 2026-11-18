import { test, expect, arriveAtBill, declarePayment } from "./support/fixtures";
import { api, uniqueReference } from "./support/api";

/**
 * 10. El comensal se entera, sin recargar, de que el personal rechazó su pago.
 *
 * Antes la tarjeta decía «por verificar» desde la memoria del teléfono y ahí se
 * quedaba: un rechazo no llegaba nunca, y el comensal o preguntaba al mesero o
 * pagaba otra vez. Se prueba el rechazo y no la confirmación porque confirmar
 * cierra la cuenta y la pantalla de la cuenta deja de existir; el rechazo es
 * el caso en que el comensal tiene que hacer algo.
 */
test("un pago rechazado se ve en el teléfono y se puede volver a avisar", async ({
  page,
  seed,
}) => {
  const table = await seed("rechazo-visible");

  await arriveAtBill(page, table);
  await page.getByTestId("guest-pay-full").click();
  await page.getByTestId("guest-continue").click();

  const reference = uniqueReference();
  await declarePayment(page, { reference });
  await expect(page.getByTestId("guest-claim-sent")).toBeVisible();

  // El personal lo rechaza desde su panel (aquí, por API).
  const claims = await api.get<{ data: { id: string; declaredReference: string | null }[] }>(
    "/api/v1/payments/claims?status=PENDING",
    table.auth,
  );
  const claim = claims.data.find((c) => c.declaredReference === reference);
  expect(claim, "the declared claim is listed for the staff").toBeTruthy();
  await api.post(`/api/v1/payments/claims/${claim!.id}/reject`, { reason: "prueba" }, table.auth);

  // El teléfono lo ve solo: pregunta cada pocos segundos mientras espera.
  const rejected = page.getByTestId("guest-claim-rejected");
  await expect(rejected).toBeVisible({ timeout: 15_000 });
  await expect(rejected).not.toContainText("prueba");

  // Y puede volver a avisar: la referencia queda libre.
  await rejected.getByRole("button").click();
  await expect(page.getByTestId("guest-claim-rejected")).toHaveCount(0);
  await expect(page.locator("#claim-amount")).toBeVisible();
});
