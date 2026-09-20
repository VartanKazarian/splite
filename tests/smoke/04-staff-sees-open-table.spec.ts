import { test, expect, loginAsStaff } from "./support/fixtures";

/**
 * 4. El personal entra y encuentra la mesa con su cuenta abierta.
 *
 * Es la mitad del producto que no ve el comensal: si esto no llega, nadie
 * cobra ni cierra nada. Lo que se afirma es la cadena entera -- credenciales,
 * sesión guardada, panel, lista de mesas y el detalle de una -- porque se
 * rompe por cualquiera de sus eslabones y desde fuera se ve igual.
 */
test("el personal entra al panel y abre la mesa con cuenta", async ({ page, seed }) => {
  const table = await seed("panel");

  await loginAsStaff(page);

  await page.goto("/mesas");
  // Filtrando por nombre: la lista de un local de verdad tiene decenas de
  // mesas y la de esta máquina acumula las de cada ejecución.
  await page.getByTestId("table-search").fill(table.tableName);

  const row = page.getByTestId(`table-row-${table.tableId}`);
  await expect(row).toBeVisible();
  // La fila dice lo que queda por cobrar, que es lo único que se mira de un
  // vistazo al cruzar el comedor.
  await expect(row).toContainText("Bs");

  await row.click();

  // El detalle se abre sobre la lista y trae la cuenta: el nombre de la mesa
  // en la cabecera y las líneas consumidas dentro.
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(table.tableName);
  const firstLine = table.items[0];
  expect(firstLine).toBeDefined();
  await expect(sheet).toContainText(firstLine!.name);
});
