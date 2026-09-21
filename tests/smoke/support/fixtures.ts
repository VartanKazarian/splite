import { test as base, expect, type Page } from "@playwright/test";

import { assertWritableTarget, ownerCredentials, ownerSession } from "./api";
import { seedOpenBill, type Seed, type SeedLine } from "./seed";

/**
 * Lo compartido por los seis recorridos.
 *
 * `seed` es una función y no un valor preparado: cada prueba decide qué líneas
 * quiere en la cuenta, y dos de ellas necesitan dos mesas distintas.
 */
type Fixtures = {
  seed: (label: string, lines?: SeedLine[]) => Promise<Seed>;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  seed: async ({}, use) => {
    assertWritableTarget();
    await use((label, lines) => (lines ? seedOpenBill(label, lines) : seedOpenBill(label)));
  },
});

export { expect };

/**
 * Ir a una pantalla y esperar a que esté viva.
 *
 * Esto se sirve renderizado desde el servidor: el HTML llega antes que React,
 * así que hay una ventana en la que los campos existen y no guardan nada y los
 * botones existen y no hacen nada. Escribir ahí dentro se pierde al hidratar
 * -- medido: el formulario de acceso salía vacío después de rellenarlo y el
 * clic no llegaba a ningún manejador.
 *
 * `networkidle` no está aquí por la red, está porque es la señal barata de que
 * el paquete ya se descargó y corrió. Un marcador propio en la página sería
 * más exacto, y sería código de producción que sólo existe para las pruebas.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/**
 * Recargar de verdad.
 *
 * `goto` a la dirección en la que ya se está no recarga nada: el navegador lo
 * trata como un salto de ancla y la página sigue viva, con lo que se hubiera
 * escrito todavía en los campos. Una prueba que compruebe «esto se guardó»
 * volviendo con `goto` comprueba que sabe teclear -- descubierto mutando el
 * guardado del RIF para que no llamara a la API: la prueba seguía pasando.
 */
export async function reloadHydrated(page: Page): Promise<void> {
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/**
 * Escanear el QR y abrir la cuenta.
 *
 * Los dos pasos van juntos porque son uno solo para quien está sentado a la
 * mesa: apunta con la cámara y toca «Tu cuenta». Lo que cada prueba quiere
 * afirmar empieza después.
 */
export async function arriveAtBill(page: Page, seed: Seed): Promise<void> {
  await gotoHydrated(page, seed.guestPath);
  await page.getByTestId("guest-open-bill").click();
  // Hay algo que pagar: la barra flotante ofrece las dos cosas que se pueden
  // hacer aquí. Si no aparece, la cuenta no llegó.
  await expect(page.getByTestId("guest-pay-full")).toBeVisible();
}

/**
 * Empezar ya dentro del panel, sin pasar por el formulario.
 *
 * Para los recorridos cuyo tema no es entrar. Lo que hacen aquí es lo mismo
 * que hace la aplicación al acabar de entrar -- dejar la sesión en
 * `localStorage` -- y no se salta ninguna comprobación del servidor: cada
 * petición sigue llevando su token.
 *
 * Que entrar funciona lo afirma el recorrido 4, que es el único que debe
 * romperse si el formulario de acceso se rompe.
 */
export async function asStaff(page: Page): Promise<void> {
  const session = await ownerSession();
  await page.addInitScript((value: string) => {
    window.localStorage.setItem("splite.staff.session", value);
  }, JSON.stringify(session));
}

/** Entrar al panel como el dueño, por el formulario. */
export async function loginAsStaff(page: Page): Promise<void> {
  const { email, password } = ownerCredentials();
  await gotoHydrated(page, "/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/dashboard");
}

/**
 * Rellenar y enviar el aviso de pago.
 *
 * El importe no se toca salvo que la prueba quiera pagar otra cosa: el campo
 * llega con lo que se debe ya escrito, y sobrescribirlo con lo mismo probaría
 * que sabemos teclear, no que la pantalla propone bien.
 */
export async function declarePayment(
  page: Page,
  { reference, amount }: { reference: string; amount?: string },
): Promise<string> {
  await page.getByTestId("guest-pay-tab-claim").click();
  if (amount !== undefined) await page.locator("#claim-amount").fill(amount);
  const declared = await page.locator("#claim-amount").inputValue();
  await page.locator("#claim-reference").fill(reference);
  await page.getByTestId("guest-claim-submit").click();
  return declared;
}
