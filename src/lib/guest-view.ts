/**
 * Qué pantalla de la mesa está mirando un comensal.
 *
 * Vive en la URL (`/t?qr=...&view=menu`) y no en el estado del componente, para
 * que el botón "atrás" del teléfono -- que es con el que vuelve de verdad
 * alguien sentado a una mesa -- vaya de la cuenta a la carta y de la carta a la
 * mesa. Con el estado dentro del componente ese botón se llevaba al comensal
 * fuera del restaurante, a la página comercial de Splite.
 *
 * En un módulo aparte y no junto al componente porque lo usan las dos rutas de
 * invitado al validar sus parámetros, y un archivo que exporta componentes y
 * funciones a la vez rompe el fast refresh en desarrollo.
 *
 * "landing" no se escribe nunca: es la ausencia de `view`, para que el enlace
 * del QR siga siendo exactamente el que está impreso en la mesa.
 */
export type GuestView = "menu" | "bill";

export function isGuestView(value: unknown): value is GuestView {
  return value === "menu" || value === "bill";
}
