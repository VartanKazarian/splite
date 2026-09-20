import { defineConfig, devices } from "@playwright/test";

/**
 * Las pruebas de humo: seis recorridos que afirman que se puede llegar hasta
 * el final de lo que da dinero.
 *
 * No afirman cómo se ve nada. La distinción es deliberada: una prueba que fije
 * píxeles o textos se rompe con cada retoque y acaba borrándose. Una que fije
 * «el comensal puede pagar» sobrevive a un rediseño entero, que es justo lo
 * que le va a pasar a este producto.
 *
 * Necesitan dos cosas levantadas: esta web y la API. Ver tests/smoke/README.md.
 */

const WEB = (process.env["SMOKE_WEB_URL"] ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const API = (process.env["SMOKE_API_URL"] ?? "http://127.0.0.1:4010").replace(/\/$/, "");

/**
 * El navegador que ya está en el disco.
 *
 * Sin esta variable Playwright busca la versión exacta que le corresponde a su
 * número de versión, así que un entorno que trae Chromium instalado aparte
 * -- el contenedor de desarrollo -- falla con «browser not found» hasta que
 * alguien descarga medio gigabyte. En CI no se define y se usa el que instala
 * `playwright install`.
 */
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "./tests/smoke",
  // Un fallo aquí es un fallo. Reintentar esconde exactamente lo que esta
  // suite existe para enseñar, así que no se reintenta en ningún sitio.
  retries: 0,
  // En serie, y no por ahorrar máquina: la API limita por ventana de tiempo
  // -- sesiones de invitado, avisos de pago -- y seis recorridos a la vez
  // contra el mismo Redis se quedan a un RATE_LIMITED de distancia de fallar
  // por algo que no es el producto. Seis recorridos cortos en serie tardan
  // alrededor de un minuto.
  workers: 1,
  fullyParallel: false,
  // Que nadie pueda dejarse un `test.only` puesto y adelgazar la suite sin
  // que se note.
  forbidOnly: Boolean(process.env["CI"]),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      // Un teléfono, porque es donde ocurre: el comensal escanea con el suyo y
      // el personal lleva el panel en la mano. Probar esto a 1280 px es probar
      // una pantalla que casi nadie usa.
      name: "phone",
      use: { ...devices["Pixel 7"] },
    },
  ],
  // Reutiliza el servidor que ya esté escuchando -- en local casi siempre lo
  // está -- y levanta uno sólo si no. La API no se levanta desde aquí: necesita
  // base de datos y migraciones, y eso lo hace quien arranca la suite.
  webServer: {
    // El host y el puerto se le pasan, no se dan por supuestos: `vite dev` sin
    // argumentos escucha en el 8080 y en `::`, así que arrancaba donde nadie
    // lo estaba mirando -- y en una máquina sin IPv6 ni siquiera arrancaba.
    command: `bun run dev -- --host ${new URL(WEB).hostname} --port ${new URL(WEB).port}`,
    url: WEB,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_API_BASE_URL: API },
  },
});
