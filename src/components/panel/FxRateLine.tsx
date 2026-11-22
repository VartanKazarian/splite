import { useQuery } from "@tanstack/react-query";

import { useI18n } from "@/lib/i18n";
import { exchangeRate, formatFxRate } from "@/lib/api";
import "@/lib/i18n-staff";

/**
 * La tasa del BCV, en una línea encima de los cobros.
 *
 * Fue primero una sección del panel y luego una pestaña de Pagos: las dos
 * veces, una pantalla entera para dos números y un botón. Es información, no
 * una tarea -- se mira cuando una conversión no cuadra --, así que va donde se
 * cuadra el dinero y no ocupa más que una línea:
 *
 *   Tasa BCV · USD 236,4567 Bs · EUR 274,1023 Bs · 19 nov.
 *
 * Sin botón propio: «Actualizar», encima, la recarga con lo demás. Si el BCV
 * no contesta se dice en ámbar, en la misma línea, con «Reintentar» al lado:
 * el servidor no inventa una tasa que no ha podido comprobar, así que «no hay
 * tasa» es un estado real.
 */
export function FxRateLine() {
  const { t, lang } = useI18n();
  const rates = useQuery({ queryKey: ["fx"], queryFn: exchangeRate, retry: false });
  const today = Object.entries(rates.data?.rates ?? {});
  const day = shortDay(today[0]?.[1].valueDate, lang);

  return (
    <p
      className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${
        rates.isError ? "text-amber-700" : "text-muted-foreground"
      }`}
    >
      <span className="font-medium text-foreground">{t("fxLineLabel")}</span>
      {rates.isError ? (
        <>
          <span>· {t("fxCouldNotLoad")}</span>
          <button
            type="button"
            onClick={() => void rates.refetch()}
            disabled={rates.isFetching}
            className="min-h-11 underline underline-offset-2 disabled:opacity-40"
          >
            {t("retry")}
          </button>
        </>
      ) : rates.isLoading ? (
        <span>· …</span>
      ) : (
        <>
          {today.map(([code, r]) => (
            <span key={code} className="whitespace-nowrap">
              · {code} <span className="money-sm text-foreground">{formatFxRate(r.rate)} Bs</span>
            </span>
          ))}
          {day && <span className="whitespace-nowrap">· {day}</span>}
        </>
      )}
    </p>
  );
}

/** «19 nov.»: la fecha valor, corta, para que la línea quepa. Leída en UTC: es un día, no un instante. */
function shortDay(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "es-VE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
