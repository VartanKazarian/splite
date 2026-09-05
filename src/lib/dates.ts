/**
 * Cómo se escribe una fecha en Splite.
 *
 * Había cuatro formas distintas de escribir el mismo instante, y se veían a la
 * vez: "5 de septiembre de 2026" en Tasas, "5/9/2026, 8:49:28 a. m." en Pagos,
 * "3/9/2026, 9:14:48 p. m." en Menú y sólo "10:02 p. m." en Movimiento. Cuatro
 * formatos es lo mismo que ninguno: quien mira no aprende a leerlos.
 *
 * Además cuatro de esas llamadas fijaban "es-VE" a mano, así que con la
 * aplicación en inglés las fechas seguían saliendo en español -- el mismo
 * defecto que el diccionario ya había arreglado en el resto del texto.
 *
 * Y ninguna necesitaba segundos. Nadie concilia un pago móvil por el segundo.
 */

/** El idioma elegido, como etiqueta de locale. */
function locale(lang: string): string {
  return lang === "en" ? "en-GB" : "es-VE";
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Una fecha sin hora ("2026-09-05") es un día del calendario, no un instante:
  // sin la hora local, el navegador la lee como UTC y puede mover el día.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Un día del calendario: "5 de septiembre de 2026". */
export function formatDay(value: string | null | undefined, lang: string): string | null {
  const d = parse(value);
  if (!d) return null;
  return d.toLocaleDateString(locale(lang), { day: "numeric", month: "long", year: "numeric" });
}

/** Un instante, sin segundos: "5 sept 2026, 20:49". */
export function formatDateTime(value: string | null | undefined, lang: string): string | null {
  const d = parse(value);
  if (!d) return null;
  return d.toLocaleString(locale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Sólo la hora: "20:49". */
export function formatTime(value: string | null | undefined, lang: string): string | null {
  const d = parse(value);
  if (!d) return null;
  return d.toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit" });
}

/**
 * Para un listado que mezcla días: la hora si es de hoy, y el día si no.
 *
 * El movimiento del turno enseñaba sólo la hora, y las últimas veinte entradas
 * no caben en un turno: la lista iba "10:02 p. m., 08:49 a. m., 01:51 p. m." y
 * parecía desordenada cuando lo que pasaba es que eran días distintos.
 */
export function formatWhen(value: string | null | undefined, lang: string): string | null {
  const d = parse(value);
  if (!d) return null;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? formatTime(value, lang) : formatDateTime(value, lang);
}
