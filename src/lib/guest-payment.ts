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
const KEY = "splite:paymentid";

export function rememberPayment(id: string) {
  try {
    sessionStorage.setItem(KEY, id);
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
  } catch {
    /* nada que hacer */
  }
}
