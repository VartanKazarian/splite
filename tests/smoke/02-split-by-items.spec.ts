import { test, expect, arriveAtBill, declarePayment } from "./support/fixtures";
import { uniqueReference } from "./support/api";

/** «12.599,42 Bs» -> 1259942n. Lo que la pantalla enseña, en céntimos. */
function centsOf(text: string): bigint {
  const digits = text
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", "");
  return BigInt(digits || "0");
}

/**
 * 2. Dividir eligiendo lo que uno consumió, y pagar sólo eso.
 *
 * Es la razón por la que existe el producto: el camarero deja de repartir la
 * cuenta a mano.
 *
 * La afirmación que importa no es «se llega al formulario», es que **la cifra
 * no cambia por el camino**. Lo que el botón promete y lo que el formulario
 * del banco pide tienen que ser el mismo número, porque entre las dos
 * pantallas no hay nada que el comensal pueda haber decidido. Esta prueba
 * nació encontrándoselas distintas: la barra decía 12.599,42 y el formulario
 * aparecía con 16.417,42, la cuenta de toda la mesa.
 */
test("un comensal elige lo suyo y paga su parte", async ({ page, seed }) => {
  const table = await seed("por-productos", [
    { name: "arepa", priceMinorUnits: "1200", quantity: 1 },
    { name: "cafe", priceMinorUnits: "400", quantity: 1 },
  ]);
  const mine = table.items[0];
  expect(mine).toBeDefined();

  await arriveAtBill(page, table);

  await page.getByTestId("guest-split-open").click();
  await page.getByTestId("guest-split-mode-ITEMS").click();

  // Una sola línea de las dos.
  await page.getByTestId(`guest-item-${mine!.id}`).click();
  await expect(page.getByTestId(`guest-item-${mine!.id}`)).toHaveAttribute("aria-pressed", "true");

  // Su parte, no la cuenta: el servidor calcula el reparto y la barra deja de
  // ofrecer el total de la mesa.
  const dock = page.getByTestId("guest-continue");
  await expect(dock).toContainText("Bs");
  const billTotal = BigInt(table.bill.totalDueVes);
  await expect.poll(async () => centsOf((await dock.textContent()) ?? "")).toBeLessThan(billTotal);

  await dock.click();
  // Paso 2, la propina. Lo que se pagará ya lleva todo dentro.
  const promised = centsOf((await dock.textContent()) ?? "");
  await dock.click();

  const reference = uniqueReference();
  const declared = await declarePayment(page, { reference });

  // El formulario del banco pide exactamente lo prometido.
  expect(centsOf(declared)).toBe(promised);
  expect(centsOf(declared)).toBeLessThan(billTotal);

  await expect(page.getByTestId("guest-claim-sent")).toBeVisible();
});
