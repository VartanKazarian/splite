import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { exchangeRate, formatFxRate, staffSession } from "@/lib/api";
import { PanelHeader } from "@/components/PanelHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { LoadFailed } from "@/components/shell/LoadFailed";
import { formatDay } from "../lib/dates";

export const Route = createFileRoute("/tasas")({
  head: () => ({
    meta: [
      { title: "Tasas BCV — Splite" },
      {
        name: "description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Tasas BCV — Splite" },
      {
        property: "og:description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RatesPage,
});

function RatesPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!staffSession.get()) navigate({ to: "/login" });
    else setReady(true);
  }, [navigate]);

  const rates = useQuery({
    queryKey: ["fx"],
    queryFn: exchangeRate,
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;

  const today = Object.entries(rates.data?.rates ?? {});

  return (
    <div className="min-h-screen">
      <PanelHeader current="tasas" />

      <main className="mx-auto max-w-3xl px-5 py-8">
        <PageHeader
          title={t("exchangeRate")}
          meta={t("fxSource")}
          actions={
            <button
              onClick={() => rates.refetch()}
              disabled={rates.isFetching}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${rates.isFetching ? "animate-spin" : ""}`} />{" "}
              {t("refreshRates")}
            </button>
          }
        />

        {/* Si la tasa llegó o no. El servicio se niega a servir una tasa que no
            ha podido verificar -- devuelve 503 en vez de adivinar -- así que
            "no hay tasa" es un estado real y se dice, no se disimula. */}
        <p
          className={`mt-3 inline-flex items-center gap-2 text-xs ${
            rates.isError ? "text-amber-700" : "text-muted-foreground"
          }`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${rates.isError ? "bg-amber-500" : "bg-primary"}`}
          />
          {rates.isError ? t("fxStale") : t("fxFresh")}
        </p>

        <section className="surface mt-6 p-6">
          <h2 className="text-xl">{t("todayRate")}</h2>
          {/* Sin el código del error ni el identificador de la petición: quien
              mira esta pantalla no puede hacer nada con ellos. */}
          {rates.isError && (
            <div className="mt-3">
              <LoadFailed message={t("fxCouldNotLoad")} onRetry={() => void rates.refetch()} />
            </div>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {today.length === 0 && !rates.isError && (
              <li className="text-muted-foreground">
                {rates.isLoading ? "…" : t("fxHistoryEmpty")}
              </li>
            )}
            {today.map(([code, r]) => (
              <li key={code} className="flex justify-between border-b border-border pb-2">
                {/* Ni la constante del backend ni la fecha en crudo. Esto
                    enseñaba "USD · Fecha valor Sat Sep 05 · BCV_LAST_IN_FORCE"
                    a un restaurante venezolano: un nombre de enum y una fecha
                    en inglés. La fecha llega en ISO desde el servidor, así que
                    se puede escribir en el idioma de quien mira. */}
                <span className="text-muted-foreground">
                  {code} · {t("valueDate")} {formatDay(r.valueDate, lang) ?? "—"} ·{" "}
                  {sourceLabel(r.source, t)}
                </span>
                <span className="figure">{formatFxRate(r.rate)} Bs</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t("settlementNote")}</p>
        </section>
      </main>
    </div>
  );
}

/** La fecha valor en el idioma de quien mira. El servidor la manda en ISO. */
function fxDate(iso: string | null, lang: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** De dónde sale la tasa, dicho en palabras. `source` es una constante del backend. */
function sourceLabel(source: string, t: (k: never) => string): string {
  if (source === "BCV") return t("fxSourceBCV" as never);
  if (source === "BCV_LAST_IN_FORCE") return t("fxSourceBCVLastInForce" as never);
  if (source === "IDENTITY") return t("fxSourceIdentity" as never);
  // Una fuente que no conocemos no se enseña en crudo: mejor no decir nada
  // que enseñar un nombre de constante.
  return t("fxSourceBCV" as never);
}
