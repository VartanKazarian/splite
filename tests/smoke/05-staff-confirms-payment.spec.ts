import { test, expect, asStaff, gotoHydrated } from "./support/fixtures";
import { uniqueReference } from "./support/api";
import { declareClaim, openGuestSession, readBill } from "./support/seed";

/**
 * 5. El personal confirma un pago declarado y la cuenta se cierra.
 *
 * Es el único punto donde el dinero declarado se convierte en dinero cobrado:
 * hasta que alguien del local dice «sí, llegó», la cuenta sigue abierta.
 *
 * El aviso se declara por API y no por pantalla a propósito: eso ya lo prueban
 * los recorridos 1 y 2, y repetirlo aquí ataría esta prueba a que aquéllos
 * sigan funcionando para poder decir nada sobre el panel.
 */
test("el personal confirma un aviso y la cuenta queda cerrada", async ({ page, seed }) => {
  const table = await seed("confirmar");

  const guest = await openGuestSession(table.qrToken);
  const claim = await declareClaim(guest, {
    amountVes: table.bill.remainingVes,
    reference: uniqueReference(),
  });
  expect(claim.status).toBe("PENDING");
  expect(await readBill(table)).toMatchObject({ status: "OPEN" });

  await asStaff(page);
  await gotoHydrated(page, "/pagos");

  const confirm = page.getByTestId(`claim-confirm-${claim.id}`);
  await confirm.scrollIntoViewIfNeeded();
  await expect(confirm).toBeVisible();
  await confirm.click();

  // Deja de estar por verificar: la lista es de lo que falta por mirar, y un
  // aviso confirmado que siguiera ahí se confirmaría dos veces.
  await expect(confirm).toHaveCount(0);

  // Y la cuenta se cerró de verdad, no sólo en la pantalla.
  await expect.poll(async () => (await readBill(table)).status).toBe("CLOSED");
  expect((await readBill(table)).remainingVes).toBe("0");
});
