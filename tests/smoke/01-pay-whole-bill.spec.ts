import { test, expect, arriveAtBill, declarePayment } from "./support/fixtures";
import { uniqueReference } from "./support/api";
import { readBill } from "./support/seed";

/**
 * 1. Escanear, ver la cuenta, pagarla entera y avisar de que está pagada.
 *
 * Es el recorrido que sostiene todo lo demás: si esto se rompe, el producto no
 * cobra. Termina donde termina para el comensal -- en la confirmación de que
 * su aviso llegó -- y no en la cuenta cerrada, que depende de que alguien del
 * local lo confirme. Eso es la prueba 5.
 */
test("un comensal paga la cuenta entera y declara el pago", async ({ page, seed }) => {
  const table = await seed("pago-total");

  await arriveAtBill(page, table);

  // Pagar la cuenta entera: propina y luego el pago.
  await page.getByTestId("guest-pay-full").click();
  await page.getByTestId("guest-continue").click();

  const reference = uniqueReference();
  const declared = await declarePayment(page, { reference });

  await expect(page.getByTestId("guest-claim-sent")).toBeVisible();
  // El importe que la pantalla propuso no era cero: un aviso por cero pasaría
  // todos los pasos y no sería un pago.
  expect(declared).not.toMatch(/^0(,00)?$/);

  // Y el aviso existe del lado del servidor, no sólo en la pantalla. Sigue
  // pendiente: nadie lo ha confirmado todavía, así que la cuenta sigue abierta.
  const bill = await readBill(table);
  expect(bill.status).toBe("OPEN");
});
