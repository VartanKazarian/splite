import type { FloorTable } from "@/lib/api";

/**
 * Cuánto lleva abierta una cuenta, en minutos.
 *
 * Lo manda el servidor en `openMinutes`, y por un motivo que está escrito en el
 * propio contrato: «computed here rather than by the client: a browser
 * subtracting dates uses the visitor's clock, which is how a table reads as
 * opened in the future». El panel restaba fechas en el navegador contra un
 * listado aparte de cuentas abiertas; con el reloj del teléfono mal puesto eso
 * da antigüedades negativas o de días.
 *
 * El respaldo con `openedAt` se queda para las respuestas que todavía no traen
 * `openMinutes`, pero es respaldo, no el camino normal.
 */
export function openMinutesOf(
  bill: NonNullable<FloorTable["openBill"]>,
  fallbackOpenedAt?: string,
): number | null {
  if (typeof bill.openMinutes === "number") return Math.max(0, bill.openMinutes);
  const iso = bill.openedAt ?? fallbackOpenedAt;
  if (!iso) return null;
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return Number.isFinite(minutes) ? Math.max(0, minutes) : null;
}

/** "48 h 2 min", "35 min". */
export function formatAge(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  // "12 h 0 min" es una forma rara de escribir "12 h".
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Cuándo una cuenta abierta pasa a mirarse en ámbar.
 *
 * **Esto es presentación, no una regla del negocio.** No existe ningún umbral
 * en el backend ni en el resto de la aplicación, y este no crea uno: nada se
 * cierra, se cobra ni se marca por cruzarlo. Sólo cambia el color de un texto
 * que ya se enseñaba. Si algún día el servidor define uno de verdad, este
 * número se borra y se usa aquél.
 *
 * Doce horas y no cuatro porque una cena larga son cuatro horas y marcarlas
 * todas en ámbar es no marcar ninguna: con el umbral bajo, las ocho mesas de
 * la sala salían en ámbar a la vez. Doce horas es "esto se quedó abierto de
 * un servicio para otro", que sí es algo que alguien tiene que mirar.
 */
export const AGE_ATTENTION_MINUTES = 12 * 60;

export type TableTone = "free" | "open" | "attention";

/**
 * El estado con el que se pinta una mesa.
 *
 * Ámbar sólo con un motivo real: o hay avisos de pago esperando a que alguien
 * los verifique (`pendingClaims`, que es dinero declarado y sin confirmar), o
 * la cuenta lleva abierta más de lo normal. Sin motivo, verde.
 */
export function toneOf(table: FloorTable): TableTone {
  const bill = table.openBill;
  if (!bill) return "free";
  if ((bill.pendingClaims ?? 0) > 0) return "attention";
  const minutes = openMinutesOf(bill);
  if (minutes !== null && minutes >= AGE_ATTENTION_MINUTES) return "attention";
  return "open";
}

/**
 * Qué parte de la cuenta está cobrada, de 0 a 100.
 *
 * Aritmética de presentación sobre dos cifras que ya manda el servidor; el
 * importe exacto se enseña siempre al lado en palabras, así que la barra no es
 * la fuente de nada. `BigInt` y no `Number` porque son unidades menores en
 * cadena y pueden pasar de 2^53.
 */
export function paidPercent(paidVes: string | undefined, totalVes: string | undefined): number {
  try {
    const paid = BigInt(paidVes || "0");
    const total = BigInt(totalVes || "0");
    if (total <= 0n) return 0;
    const pct = Number((paid * 100n) / total);
    return Math.max(0, Math.min(100, pct));
  } catch {
    return 0;
  }
}
