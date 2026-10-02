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

/** "757.54060000" -> "757,54": la tasa como se lee en Venezuela, con dos decimales. */
export function formatRate(rate: string): string {
  const [whole = "0", fraction = ""] = rate.split(".");
  const cents = (fraction + "00").slice(0, 2);
  return `${Number(whole).toLocaleString("es-VE")},${cents}`;
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
