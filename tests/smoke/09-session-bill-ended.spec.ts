import { test, expect, arriveAtBill } from "./support/fixtures";
import { api, ApiCallError } from "./support/api";
import { openGuestSession } from "./support/seed";

/**
 * 9. Un teléfono es de una cuenta, no de la mesa.
 *
 * Ana entra con el QR. Su cuenta se anula y en la misma mesa se abre la de los
 * siguientes. El teléfono de Ana no debe ver esa cuenta: le dice que la suya
 * terminó. Si sigue sentada ahí, un botón abre la cuenta de la mesa ahora,
 * igual que volver a escanear.
 *
 * Necesita una API que ate la sesión a la cuenta (`details.reason` en el 404
 * de la cuenta del invitado). La CI de este repositorio levanta el `main` del
 * backend; hasta que ese cambio esté allí, esto se salta en vez de fallar.
 */
test("cuando la cuenta termina, el teléfono no ve la siguiente de la mesa", async ({
  page,
  seed,
}) => {
  const table = await seed("termina");

  // ¿La API ata la sesión a la cuenta? Se pregunta antes de nada: con una API
  // anterior, el teléfono vería sin más la cuenta nueva y la prueba esperaría
  // algo que nunca llega. Una mesa vacía contesta 404 con `details.reason`
  // sólo si la API ya distingue por qué no hay cuenta.
  const probe = await api.post<{ id: string }>(
    "/api/v1/tables",
    { name: `${table.tableName}-sonda` },
    table.auth,
  );
  const qr = await api.get<{ token: string }>(`/api/v1/guest/tables/${probe.id}/qr`, table.auth);
  const reason = await api
    .get("/api/v1/guest/bill", await openGuestSession(qr.token))
    .then(() => null)
    .catch((e: unknown) =>
      e instanceof ApiCallError
        ? ((e.payload as { error?: { details?: { reason?: string } } })?.error?.details?.reason ??
          null)
        : null,
    );
  test.skip(reason === null, "la API todavía no ata la sesión a la cuenta");

  await arriveAtBill(page, table);

  // La cuenta de Ana se anula y la mesa recibe a otros.
  await api.post(`/api/v1/bills/${table.billId}/void`, undefined, table.auth);
  const next = await api.post<{ id: string }>(
    "/api/v1/bills",
    { tableId: table.tableId, totalDueMinorUnits: "0" },
    table.auth,
  );

  // El teléfono vuelve a mirar la cuenta cada diez segundos.
  const ended = page.getByTestId("guest-session-ended");
  await expect(ended).toBeVisible({ timeout: 20_000 });

  await expect(page.getByTestId("guest-pay-full")).toHaveCount(0);
  await page.screenshot({ path: "test-results/09-session-ended.png", fullPage: true });

  // Sigue en la mesa: abre la cuenta de ahora.
  await page.getByTestId("guest-rejoin-table").click();
  await expect(ended).toHaveCount(0);
  // La cuenta nueva acaba de abrirse y todavía no tiene nada: es esa la que
  // se ve, y no la anulada.
  await expect(page.getByText("Todavía no hay nada en tu cuenta")).toBeVisible();
  expect(next.id).not.toBe(table.billId);
});
