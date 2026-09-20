import { test, expect, asStaff, gotoHydrated, reloadHydrated } from "./support/fixtures";

/**
 * 6. Los ajustes fiscales: quién emite y con qué números.
 *
 * Sin RIF y sin serie el local no puede emitir una factura, así que esta
 * pantalla es la puerta de todo lo fiscal. Se prueba que se llega, que se
 * escribe y que lo escrito sobrevive a una recarga -- lo último es lo que
 * separa «se guardó» de «se pintó».
 *
 * No se comprueba que el número sea el correcto: eso lo dice una autorización
 * del SENIAT en papel y no hay nada en el código que pueda saberlo.
 */

/**
 * El dígito verificador de un RIF, para escribir uno que cuadre.
 *
 * Se calcula aquí en vez de copiar uno fijo porque el RIF es único entre
 * locales: repetir siempre el mismo haría que la segunda base de datos donde
 * corra esto respondiera 409 en vez de guardar.
 */
function rifWithCheckDigit(body: string): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + Number(body[i]) * w, 3 /* J */ * 4);
  const candidate = 11 - (sum % 11);
  return `J${body}${candidate > 9 ? 0 : candidate}`;
}

test("el dueño configura el RIF y la serie fiscal", async ({ page }) => {
  await asStaff(page);
  await gotoHydrated(page, "/settings");
  await page.getByTestId("settings-tab-cobros").click();

  // --- Se escriben las dos cosas ------------------------------------------
  //
  // Y se recarga una sola vez, al final, para comprobar las dos. No es por
  // ahorrar segundos: cada carga de esta pantalla pregunta por la sesión y por
  // el segundo factor, y `/api/v1/auth` admite diez llamadas por minuto y por
  // dirección. Con una recarga por campo, la suite se cortaba a sí misma el
  // acceso antes de terminar -- pasó en CI.
  const locked = page.getByTestId("fiscal-rif-locked");
  const input = page.getByTestId("fiscal-rif-input");
  await expect(locked.or(input)).toBeVisible();

  // `null` cuando el RIF ya está congelado: se emitió con él, y cambiarlo
  // contradiría las facturas que están en la calle. Ahí la pantalla tiene que
  // decirlo en vez de ofrecer un campo que sólo puede responder 409.
  const wroteRif = (await locked.isVisible())
    ? null
    : await (async () => {
        const rif = rifWithCheckDigit(String(Date.now()).slice(-8).padStart(8, "0"));
        await input.fill(rif);
        await page.getByTestId("fiscal-rif-save").click();
        return rif;
      })();

  if (wroteRif === null) await expect(locked).toContainText(/J/);

  const first = String((Math.floor(Date.now() / 1000) % 90000) + 1);
  await page.getByTestId("fiscal-series-controlPrefix").fill("00-");
  await page.getByTestId("fiscal-series-documentPrefix").fill("F-");
  await page.getByTestId("fiscal-series-padTo").fill("8");
  await page.getByTestId("fiscal-series-controlFirst").fill(first);
  await page.getByTestId("fiscal-series-authorisationRef").fill("smoke");

  // Que el próximo número se enseñe, que es lo que convierte seis campos
  // sueltos en algo que se puede cotejar con la autorización de un vistazo.
  //
  // Aquí sólo se comprueba que está: con una serie ya guardada, este texto lo
  // dicta el servidor (`nextControlNumber`) y no se recalcula al teclear, así
  // que lo que se lee antes de guardar es el número viejo. El número exacto se
  // afirma abajo, sobre lo que quedó guardado.
  await expect(page.getByTestId("fiscal-series-next")).toContainText(/\d{5}/);

  await page.getByTestId("fiscal-series-save").click();

  // --- Y sobreviven a la recarga ------------------------------------------
  //
  // Que es la diferencia entre guardado y pintado. Una recarga de verdad y no
  // un `goto` a la misma dirección: eso el navegador lo trata como un salto de
  // ancla, la página sigue viva con lo escrito en los campos, y la
  // comprobación diría que sí sin haber preguntado a nadie.
  await reloadHydrated(page);

  if (wroteRif !== null) {
    // Sin puntuación: se escribe `J383479583` y vuelve `J-38347958-3`, porque
    // la pantalla lo presenta con guiones. Es el mismo número, y exigir la
    // misma cadena sería exigir que no se formatee.
    await expect
      .poll(async () =>
        (await page.getByTestId("fiscal-rif-input").inputValue()).replace(/[^A-Z0-9]/gi, ""),
      )
      .toBe(wroteRif);
  }

  await expect(page.getByTestId("fiscal-series-controlFirst")).toHaveValue(first);
  // Ahora el próximo número lo dice el servidor, no la aritmética de la
  // pantalla, y dice lo mismo.
  await expect(page.getByTestId("fiscal-series-next")).toContainText(
    `00-${first.padStart(8, "0")}`,
  );
});
