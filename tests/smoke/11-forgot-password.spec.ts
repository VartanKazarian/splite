import { test, expect, gotoHydrated } from "./support/fixtures";
import { API } from "./support/api";

/**
 * 11. «¿Olvidaste tu contraseña?», sin el correo.
 *
 * El enlace llega por correo y aquí no hay buzón, así que se prueba lo que se
 * ve: desde el login se llega a pedirlo, la respuesta no dice si la cuenta
 * existe, y un enlace inventado o incompleto lleva a pedir otro en vez de
 * dejar a la persona atascada. El cambio de contraseña en sí lo prueban las
 * pruebas de integración del backend.
 */
test("pedir el enlace y abrir uno que no sirve", async ({ page, request }) => {
  const probe = await request.post(`${API}/api/v1/auth/password/forgot`, {
    data: { email: "nadie@example.com" },
  });
  test.skip(probe.status() === 404, "la API todavía no tiene restablecer contraseña");

  // Con la página viva antes de tocar nada (`gotoHydrated`): sin esperar, el
  // clic en «Enviar» a veces llegaba antes que React, el formulario se
  // mandaba solo al servidor y no salía ninguna petición -- falló así una vez
  // en CI, con la API sin recibir nada.
  await gotoHydrated(page, "/login");
  await page.getByTestId("login-forgot").click();
  await expect(page).toHaveURL(/\/olvide$/);
  await page.waitForLoadState("networkidle");

  await page.locator("#forgot-email").fill(`nadie-${Date.now()}@example.com`);
  await page.getByTestId("forgot-submit").click();
  // La misma respuesta exista o no la cuenta.
  await expect(page.getByTestId("forgot-sent")).toBeVisible();

  // Un enlace con un token que no existe: se ofrece pedir otro.
  await gotoHydrated(page, `/restablecer#${"a".repeat(43)}`);
  await expect(page).not.toHaveURL(/#/);
  await page.locator("#reset-password").fill("una-contraseña-larga-1");
  await page.locator("#reset-repeat").fill("una-contraseña-larga-1");
  await page.getByTestId("reset-submit").click();
  await expect(page.getByTestId("reset-invalid")).toBeVisible();

  // Sin token: lo mismo, sin pedir contraseña.
  await gotoHydrated(page, "/restablecer");
  await expect(page.getByTestId("reset-invalid")).toBeVisible();
});
