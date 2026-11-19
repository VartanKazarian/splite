import { API_BASE_URL } from "@/lib/api";

/**
 * Lo que le pasa a Splite en los navegadores de verdad (FR4): errores y velocidad.
 *
 * Hasta ahora un fallo en el teléfono de un comensal sólo le llegaba a Lovable,
 * y nadie sabía si la página de la mesa carga en dos segundos o en ocho en un
 * Android barato con 3G. Esto lo manda al backend (`POST /client-events`), que
 * guarda los errores agrupados y deja la velocidad en el log.
 *
 * Reglas:
 *
 * - **Nada personal.** La ruta sin consulta ni fragmento (el backend lo vuelve
 *   a limpiar), ni cuerpos de peticiones, ni datos de la sesión.
 * - **Nunca molesta.** Sin esperar, sin reintentos, sin lanzar: si no sale, no
 *   sale. Como mucho diez errores por página y uno de cada tipo.
 * - **Sólo en producción.** En desarrollo los errores ya se ven en consola.
 * - **Una muestra de velocidad**: una de cada cuatro visitas.
 */

type Surface = "guest" | "staff" | "public" | "admin";

/** De qué parte de Splite es esta página. */
export function surfaceOf(pathname: string): Surface {
  if (pathname.startsWith("/admin")) return "admin";
  if (/^\/(t|recibo|preview)(\/|$)/.test(pathname)) return "guest";
  if (/^\/(dashboard|mesas|menu|pagos|settings)(\/|$)/.test(pathname)) return "staff";
  return "public";
}

/** Errores que no son nuestros: extensiones del navegador y ruido conocido. */
export function isNoise(message: string, stack?: string): boolean {
  const text = `${message}\n${stack ?? ""}`;
  return (
    /chrome-extension:|moz-extension:|safari-extension:/.test(text) ||
    /ResizeObserver loop/.test(text) ||
    // El script de Lovable que se añade al publicar no es código de Splite.
    /\/__l5e\//.test(text)
  );
}

const MAX_ERRORS_PER_PAGE = 10;
const sent = new Set<string>();

function send(event: Record<string, unknown>) {
  if (!import.meta.env.PROD || typeof window === "undefined") return;
  const body = JSON.stringify({
    ...event,
    path: window.location.pathname,
    surface: surfaceOf(window.location.pathname),
  });
  try {
    // `text/plain` y `keepalive`: sale aunque se esté cerrando la página, y
    // sin pregunta previa de CORS.
    void fetch(`${API_BASE_URL}/api/v1/client-events`, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain" },
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    /* nada */
  }
}

/** Un error, una vez por página. */
export function reportError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  if (!message || isNoise(message, stack)) return;
  if (sent.has(message) || sent.size >= MAX_ERRORS_PER_PAGE) return;
  sent.add(message);
  send({
    kind: "error",
    message: message.slice(0, 2000),
    ...(stack ? { stack: stack.slice(0, 8000) } : {}),
  });
}

let installed = false;

/** Una vez, al arrancar la aplicación en el navegador. */
export function installTelemetry() {
  if (installed || typeof window === "undefined" || !import.meta.env.PROD) return;
  installed = true;

  window.addEventListener("error", (event) => reportError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason));

  if (Math.random() >= 0.25) return;
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection?.effectiveType;
  void import("web-vitals").then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
    const vital = (metric: { name: string; value: number; rating: string }) =>
      send({
        kind: "vital",
        name: metric.name,
        // Milisegundos, salvo CLS, que es una puntuación sin unidad (0,1 = bien).
        value: metric.name === "CLS" ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
        rating: metric.rating,
        ...(connection ? { connection } : {}),
      });
    onLCP(vital);
    onINP(vital);
    onCLS(vital);
    onFCP(vital);
    onTTFB(vital);
  });
}
