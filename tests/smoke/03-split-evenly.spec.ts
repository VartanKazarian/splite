import { test, expect, arriveAtBill } from "./support/fixtures";

/**
 * 3. Acordar un reparto a partes iguales, tomar una parte y ponerle nombre.
 *
 * El reparto acordado es lo que ven los demás comensales cuando abren la misma
 * cuenta, y el nombre es lo que convierte «Comensal 2» en alguien. Aquí no se
 * paga: lo que se prueba es que el acuerdo queda hecho y visible.
 */
test("una mesa acuerda partes iguales y alguien nombra la suya", async ({ page, seed }) => {
  const table = await seed("partes-iguales");

  await arriveAtBill(page, table);

  await page.getByTestId("guest-split-open").click();
  await page.getByTestId("guest-split-mode-EQUAL").click();
  await page.getByTestId("guest-split-confirm").click();

  // El reparto existe: una barra de avance y una parte por comensal. Dos es lo
  // que propone la pantalla por defecto.
  const progress = page.getByRole("progressbar");
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuemax", "2");

  // Tomar la segunda parte y nombrarla.
  await page.getByTestId("guest-share-1").click();
  await page.getByTestId("guest-share-name").fill("Vartan");
  await page.getByTestId("guest-share-name-save").click();

  // El nombre vuelve del servidor, no se queda en la pantalla: la lista se
  // relee después de guardarlo.
  await expect(page.getByTestId("guest-share-1")).toContainText("Vartan");
});
