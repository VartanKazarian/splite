import { test, expect, arriveAtBill, asStaff, gotoHydrated } from "./support/fixtures";
import { api, uniqueReference, type Auth } from "./support/api";
import { declareClaim, openGuestSession, readBill } from "./support/seed";

/**
 * 7. Dos comensales, un mismo saldo.
 *
 * Un aviso de Pago Móvil llega cuando el dinero ya salió del banco, así que lo
 * único que evita una segunda transferencia por lo mismo es que quien llega
 * después vea, antes de ir a su banco, que eso ya está en verificación. Y si
 * aun así llegan dos avisos por el mismo saldo, quien verifica tiene que
 * saberlo antes de confirmar.
 *
 * Necesitan una API que publique lo pendiente (`pendingVes` en la cuenta del
 * invitado). La CI de este repositorio levanta el `main` del backend, así que
 * hasta que ese cambio esté en `main` estas dos se saltan en vez de fallar
 * por algo que no es esta pantalla.
 */
async function skipUnlessApiPublishesPending(guest: Auth & { kind: "guest" }) {
  const bill = await api.get<Record<string, unknown>>("/api/v1/guest/bill", guest);
  test.skip(!("pendingVes" in bill), "la API todavía no publica pendingVes");
}
test("quien llega después ve lo que ya está en verificación", async ({ page, seed }) => {
  const table = await seed("pendiente");

  // Otro comensal ya avisó por toda la cuenta.
  const other = await openGuestSession(table.qrToken);
  await skipUnlessApiPublishesPending(other);
  await declareClaim(other, { amountVes: table.bill.remainingVes, reference: uniqueReference() });

  await arriveAtBill(page, table);
  await page.getByTestId("guest-pay-full").click();
  await page.getByTestId("guest-continue").click();

  // Donde se copia el importe para ir al banco: ahí es donde hace falta.
  const notice = page.getByTestId("guest-pending-notice");
  await expect(notice).toBeVisible();
  await page.screenshot({ path: "test-results/07-pending-notice.png", fullPage: true });

  // Y sigue ahí al ir a avisar, para quien ya transfirió de todos modos.
  await page.getByTestId("guest-pay-tab-claim").click();
  await expect(notice).toBeVisible();

  // Pendiente no es pagado: la cuenta sigue abierta y no se anuncia saldada.
  await expect(page.getByText(/no queda nada por pagar/i)).toHaveCount(0);
  expect((await readBill(table)).status).toBe("OPEN");
});

test("el personal ve cuándo dos avisos cubren el mismo saldo", async ({ page, seed }) => {
  const table = await seed("solapado");
  const amountVes = table.bill.remainingVes;

  const a = await openGuestSession(table.qrToken);
  const b = await openGuestSession(table.qrToken);
  await skipUnlessApiPublishesPending(a);
  const first = await declareClaim(a, { amountVes, reference: uniqueReference() });
  const second = await declareClaim(b, { amountVes, reference: uniqueReference() });

  await asStaff(page);
  await gotoHydrated(page, "/pagos");
  const confirm = page.getByTestId(`claim-confirm-${second.id}`);
  await confirm.scrollIntoViewIfNeeded();
  await expect(confirm).toBeVisible();
  // Sólo el segundo: el primero cabía entero en lo que se debía.
  await expect(page.getByTestId(`claim-overlap-${second.id}`)).toBeVisible();
  await expect(page.getByTestId(`claim-overlap-${first.id}`)).toHaveCount(0);
  await page.screenshot({ path: "test-results/07-staff-overlap.png", fullPage: true });
});
