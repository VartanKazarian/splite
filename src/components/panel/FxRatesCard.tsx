import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { exchangeRate, formatFxRate } from "@/lib/api";
import { LoadFailed } from "@/components/shell/LoadFailed";
import { formatDay } from "@/lib/dates";

/**
 * La tasa del BCV, tal y como está hoy.
 *
 * Era una sección del panel para ella sola, y no se sostenía: dos números y un
 * botón de recargar, 900 px de alto en un teléfono con la mitad vacía, y una
 * de las cinco paradas de la barra de arriba gastada en algo que no es una
 * parada del turno -- se mira cuando una conversión no cuadra, no cada rato.
 *
 * Vive dentro de Pagos, que es donde se cuadra el dinero, y es la misma
 * pregunta: por cuánto salió esto. Extraída a un componente para que la ruta
 * vieja, que ahora sólo redirige, no tenga que llevar una copia.
 */
export function FxRatesCard() {
  const { t, lang } = useI18n();

  const rates = useQuery({ queryKey: ["fx"], queryFn: exchangeRate, retry: false });
  const today = Object.entries(rates.data?.rates ?? {});

  return (
    <section className="surface mt-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl">{t("todayRate")}</h2>
        <button
          onClick={() => rates.refetch()}
          disabled={rates.isFetching}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${rates.isFetching ? "animate-spin" : ""}`} />{" "}
          {t("refreshRates")}
        </button>
      </div>

      {/* Si la tasa llegó o no. El servicio se niega a servir una tasa que no
          ha podido verificar -- devuelve 503 en vez de adivinar -- así que "no
          hay tasa" es un estado real y se dice, no se disimula. */}
      <p
        className={`mt-2 inline-flex items-center gap-2 text-xs ${
          rates.isError ? "text-amber-700" : "text-muted-foreground"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${rates.isError ? "bg-amber-500" : "bg-primary"}`}
        />
        {rates.isError ? t("fxStale") : t("fxFresh")} · {t("fxSource")}
      </p>

      {/* Sin el código del error ni el identificador de la petición: quien
          mira esto no puede hacer nada con ellos. */}
      {rates.isError && (
        <div className="mt-3">
          <LoadFailed message={t("fxCouldNotLoad")} onRetry={() => void rates.refetch()} />
        </div>
      )}

      <ul className="mt-4 space-y-2 text-sm">
        {today.length === 0 && !rates.isError && (
          <li className="text-muted-foreground">{rates.isLoading ? "…" : t("fxHistoryEmpty")}</li>
        )}
        {/* La moneda y su tasa arriba, la procedencia debajo. Iban en la misma
            línea y encadenados con puntos -- "USD · Fecha valor 5 de septiembre
            de 2026 · última publicada por el BCV" -- así que en un teléfono la
            frase ocupaba tres líneas y empujaba la tasa hasta partirla:
            "757,5406" en una y "Bs" en la siguiente. Lo que se viene a mirar
            aquí es el número. */}
        {today.map(([code, r]) => (
          <li
            key={code}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 border-b border-border pb-2 last:border-0"
          >
            <span className="font-medium">{code}</span>
            <span className="money-md justify-self-end">{formatFxRate(r.rate)} Bs</span>
            {/* Ni la constante del backend ni la fecha en crudo. Esto enseñaba
                "Fecha valor Sat Sep 05 · BCV_LAST_IN_FORCE" a un restaurante
                venezolano: un nombre de enum y una fecha en inglés. La fecha
                llega en ISO desde el servidor, así que se puede escribir en el
                idioma de quien mira. */}
            <span className="col-span-2 mt-0.5 text-xs text-muted-foreground">
              {t("valueDate")} {formatDay(r.valueDate, lang) ?? "—"} · {sourceLabel(r.source, t)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** De dónde sale la tasa, dicho en palabras. `source` es una constante del backend. */
function sourceLabel(source: string, t: (k: never) => string): string {
  if (source === "BCV") return t("fxSourceBCV" as never);
  if (source === "BCV_LAST_IN_FORCE") return t("fxSourceBCVLastInForce" as never);
  if (source === "IDENTITY") return t("fxSourceIdentity" as never);
  // Una fuente que no conocemos no se enseña en crudo: mejor no decir nada que
  // enseñar un nombre de constante.
  return t("fxSourceBCV" as never);
}
