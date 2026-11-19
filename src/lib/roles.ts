import type { StaffRole } from "@/lib/fiscal";

/**
 * Qué ofrece el panel a cada rol (R11).
 *
 * **El que decide es el servidor**, siempre: cada ruta del backend comprueba
 * el rol, y esto no protege nada. Esto decide qué se *ofrece*. Antes el panel
 * enseñaba todos los destinos y todos los botones a todo el mundo, y un
 * mesero se encontraba la Carta para editar, o «Confirmar» un pago, para que
 * el servidor le contestara que no. Un control que siempre falla es peor que
 * uno que no está.
 *
 * Por eso cada regla de aquí copia una del backend, y dice cuál. Si el backend
 * cambia una, ésta se cambia con ella.
 */

type Role = StaffRole | null | undefined;

/** `routes/menu.js`: escribir en la carta es OWNER y MANAGER. */
export const canManageMenu = (role: Role) => role === "OWNER" || role === "MANAGER";

/** `routes/payments.js`: confirmar o rechazar un aviso es OWNER, MANAGER y CASHIER. */
export const canVerifyPayments = (role: Role) =>
  role === "OWNER" || role === "MANAGER" || role === "CASHIER";

/** `routes/tables.js`: crear mesas es OWNER y MANAGER. */
export const canManageTables = (role: Role) => role === "OWNER" || role === "MANAGER";

export type PanelPage = "dashboard" | "mesas" | "menu" | "pagos";

/**
 * Dónde empieza cada uno al entrar: en lo que hace en un turno.
 *
 * - Dueño y encargado: el panel, con las cifras del día y lo que hay que atender.
 * - Caja: Pagos, que es su trabajo -- verificar avisos contra el banco.
 * - Mesero: Mesas, que es donde trabaja (la bandeja de pedidos suena en todas
 *   las pantallas, no sólo en el panel).
 */
export function homeFor(role: Role): "/dashboard" | "/mesas" | "/pagos" {
  if (role === "CASHIER") return "/pagos";
  if (role === "WAITER") return "/mesas";
  return "/dashboard";
}

/**
 * Las paradas de la barra para cada rol. Pagos se queda para el mesero aunque
 * no confirme: es donde ve si el pago de su mesa ya entró.
 */
export function navFor(role: Role): PanelPage[] {
  const pages: PanelPage[] = ["dashboard", "mesas", "menu", "pagos"];
  return canManageMenu(role) ? pages : pages.filter((page) => page !== "menu");
}
