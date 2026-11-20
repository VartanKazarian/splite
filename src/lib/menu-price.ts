import { applyRate, parseRate } from "@/lib/fiscal";

/**
 * Lo que cuesta en bolívares un precio de la carta, a la tasa que manda el
 * servidor. Null cuando no hay tasa o el precio ya está en bolívares: entonces
 * no se enseña ningún equivalente, en vez de uno inventado.
 */
export function vesEquivalent(
  priceMinorUnits: string,
  rate: { rate: string } | null | undefined,
): string | null {
  if (!rate) return null;
  try {
    return applyRate(BigInt(priceMinorUnits), parseRate(rate.rate)).toString();
  } catch {
    return null;
  }
}

/**
 * "236.45670000" -> "236,4567": la tasa del comensal, igual en la carta y en la
 * cuenta.
 *
 * La carta la recortaba a dos decimales y la cuenta la daba entera, así que el
 * mismo número salía distinto en dos pantallas seguidas. Ahora entre dos y
 * cuatro decimales, sin ceros de relleno a partir del tercero: con cuatro se
 * reconoce la del BCV y no se llena la línea de ceros.
 */
export function formatRate(rate: string): string {
  const [whole = "0", fraction = ""] = rate.split(".");
  const digits = (fraction + "00").slice(0, 4).replace(/(\d{2}\d*?)0+$/, "$1");
  return `${Number(whole).toLocaleString("es-VE")},${digits}`;
}

/** "2026-10-02" -> "2 oct." en el idioma del panel, sin pasar por la zona horaria del teléfono. */
export function formatValueDate(valueDate: string | null, lang: "es" | "en"): string {
  if (!valueDate) return "";
  const [y, m, d] = valueDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === "es" ? "es-VE" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
