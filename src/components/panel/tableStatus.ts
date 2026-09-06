import { useI18n } from "@/lib/i18n";
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
 * Por qué hay que mirar esta mesa, dicho en la píldora.
 *
 * `toneOf` decide **si** hay que mirarla; esto decide **qué** se dice. La
 * píldora ponía "Atención" para las dos únicas cosas que la encienden, que
 * piden reacciones distintas: alguien dice que ha pagado y hay que abrir la
 * app del banco, o la cuenta lleva abierta desde el turno anterior. Con diez
 * filas en la pantalla, la píldora es lo que se lee de un vistazo y la línea
 * de abajo lo que se lee al pararse en una; repetir el dato en las dos no
 * sobra, decir "Atención" en la primera sí.
 *
 * Devuelve la forma y no el texto: aquí no hay traductor, y meterlo obligaría
 * a pasar `t` por una función que sólo mira datos.
 *
 * No hay estado "pagada del todo" porque no existe: una cuenta que se salda se
 * cierra sola, así que nunca aparece en el plano. Si el importe cuadra y sigue
 * abierta es que el pago está sin verificar, y eso ya es `claims`.
 */
export type TableBadge =
  | { kind: "free"; tone: TableTone }
  | { kind: "claims"; tone: TableTone; count: number }
  | { kind: "stale"; tone: TableTone; hours: number }
  | { kind: "partly"; tone: TableTone }
  | { kind: "open"; tone: TableTone };

export function badgeOf(table: FloorTable, fallbackOpenedAt?: string): TableBadge {
  const bill = table.openBill;
  if (!bill) return { kind: "free", tone: "free" };

  const claims = bill.pendingClaims ?? 0;
  if (claims > 0) return { kind: "claims", tone: "attention", count: claims };

  const minutes = openMinutesOf(bill, fallbackOpenedAt);
  if (minutes !== null && minutes >= AGE_ATTENTION_MINUTES) {
    return { kind: "stale", tone: "attention", hours: Math.floor(minutes / 60) };
  }

  // Que el comensal haya empezado a pagar cambia lo que hace el mesero en esa
  // mesa, así que se dice; no enciende el ámbar porque no hay nada que atender.
  try {
    const paid = BigInt(bill.amountPaidVes || "0");
    if (paid > 0n) return { kind: "partly", tone: "open" };
  } catch {
    /* un importe ilegible no es media cuenta pagada */
  }
  return { kind: "open", tone: "open" };
}

/**
 * El texto y el tono de la píldora, en un sitio y no en dos.
 *
 * La fila de la lista y la cabecera de la hoja tienen que decir exactamente lo
 * mismo -- se tocan una detrás de otra --, así que la traducción de `badgeOf`
 * vive aquí. Escritas por separado, la primera vez que se añada un estado se
 * añadirá en una de las dos.
 */
export function useTableBadge(
  // Admite `null` para que quien la use pueda llamarla antes de su propio
  // "si no hay mesa, no pinto nada": un hook detrás de un return temprano se
  // salta en algunos renders y React deja de saber en qué orden van.
  table: FloorTable | null,
  fallbackOpenedAt?: string,
): { text: string; tone: TableTone } {
  const { t } = useI18n();
  if (!table) return { text: "", tone: "free" };
  const badge = badgeOf(table, fallbackOpenedAt);
  const text =
    badge.kind === "free"
      ? t("tableFreeShort")
      : badge.kind === "claims"
        ? `${badge.count} ${t("badgeClaims")}`
        : badge.kind === "stale"
          ? t("badgeStale").replace("{n}", String(badge.hours))
          : badge.kind === "partly"
            ? t("badgePartly")
            : t("tableOpenShort");
  return { text, tone: badge.tone };
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
