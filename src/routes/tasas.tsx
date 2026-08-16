import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { exchangeRate, formatFxRate, staffSession } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

export const Route = createFileRoute("/tasas")({
  head: () => ({
    meta: [
      { title: "Tasas BCV — Splite" },
      {
        name: "description",
        content: "Tasa oficial BCV del día para las cuentas del restaurante.",
      },
      { property: "og:title", content: "Tasas BCV — Splite" },
      { property: "og:description", content: "Tasa oficial BCV del día." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RatesPage,
});


function RatesPage() {
  const { t } = useI18n();
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
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> {t("backToDashboard")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl">{t("exchangeRate")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("fxSource")}</p>
          </div>
          <button
            onClick={() => rates.refetch()}
            disabled={rates.isFetching}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${rates.isFetching ? "animate-spin" : ""}`} />{" "}
            {t("refreshRates")}
          </button>
        </div>

        <section className="surface mt-6 p-6">
          <h2 className="text-xl">{t("todayRate")}</h2>
          {rates.isError && <ErrorBox error={rates.error} fallback={t("apiDown")} />}
          <ul className="mt-4 space-y-2 text-sm">
            {today.length === 0 && !rates.isError && (
              <li className="text-muted-foreground">{rates.isLoading ? "…" : t("fxHistoryEmpty")}</li>
            )}
            {today.map(([code, r]) => (
              <li key={code} className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">
                  {code} · {t("valueDate")} {r.valueDate ?? "—"} · {r.source}
                </span>
                <span>{formatFxRate(r.rate)} Bs.</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t("settlementNote")}</p>
        </section>
      </main>
    </div>
  );
}
