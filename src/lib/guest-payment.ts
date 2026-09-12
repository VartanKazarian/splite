/**
 * El pago que este teléfono declaró, recordado entre pantallas.
 *
 * Hace falta porque la factura se pide **después** de que el restaurante
 * confirme el cobro, y confirmarlo cierra la cuenta -- momento en el que la
 * pantalla de la cuenta deja de existir. Sin recordar el identificador, el
 * comensal pierde el único hilo que lo une a su propio pago.
 *
 * `sessionStorage` y no memoria por la misma razón que el paso del pago: el
 * recorrido incluye salir a la aplicación del banco y volver, y volver es una
 * carga nueva de la página.
 */
import { useSyncExternalStore } from "react";

const KEY = "splite:paymentid";

/**
 * `sessionStorage` no avisa a nadie cuando cambia dentro de la misma pestaña.
 *
 * Sin este aviso, quien leyera el identificador durante el render se quedaba
 * con el valor de ese instante -- normalmente `null`, porque el pago todavía no
 * se había declarado -- y no volvía a mirarlo nunca. El recibo y la oferta de
 * factura aparecían sólo al recargar, que es exactamente la clase de fallo que
 * ya costó un despliegue: un dato leído una vez y tratado como si fuera fijo.
 */
const CHANGED = "splite:paymentid-changed";

function announce() {
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* fuera del navegador no hay a quién avisar */
  }
}

export function rememberPayment(id: string) {
  try {
    sessionStorage.setItem(KEY, id);
    announce();
  } catch {
    // Una pestaña privada puede negarlo. Se pierde la oferta de factura, que es
    // molesto; romper el pago por eso sería peor.
  }
}

export function recallPayment(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetPayment() {
  try {
    sessionStorage.removeItem(KEY);
    announce();
  } catch {
    /* nada que hacer */
  }
}

/**
 * El identificador del pago, leído de forma que el render se entere cuando
 * cambie.
 *
 * `getServerSnapshot` devuelve `null` porque en el servidor no hay
 * `sessionStorage`: nada que recordar todavía, y fingir lo contrario haría que
 * el HTML servido y el primer render del navegador no coincidieran.
 */
export function useRememberedPayment(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(CHANGED, onChange);
      // Otra pestaña de la misma sesión también cuenta.
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(CHANGED, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    recallPayment,
    () => null,
  );
}
