import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import { exchangeRate, formatFxRate, staffSession, type ExchangeRate } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

export const Route = createFileRoute("/tasas")({
  head: () => ({
    meta: [
      { title: "Tasas BCV — Splite" },
      {
        name: "description",
        content: "Tasa oficial BCV del día y el histórico de fechas valor guardadas del restaurante.",
      },
      { property: "og:title", content: "Tasas BCV — Splite" },
      { property: "og:description", content: "Tasa del día y días anteriores guardados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RatesPage,
});

type HistoryEntry = { currency: string; rate: string; valueDate: string; source: string };

const STORE_KEY = "splite.fx.history";

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Cada lectura del BCV se archiva por (moneda, fecha valor): así queda el histórico. */
function mergeHistory(data: ExchangeRate | undefined): HistoryEntry[] {
  const current = readHistory();
  if (!data) return current;
  const next = [...current];
  for (const [currency, r] of Object.entries(data.rates ?? {})) {
    if (!r?.valueDate) continue;
    const idx = next.findIndex((e) => e.currency === currency && e.valueDate === r.valueDate);
    const entry: HistoryEntry = {
      currency,
      rate: r.rate,
      valueDate: r.valueDate,
      source: r.source,
    };
    if (idx >= 0) next[idx] = entry;
    else next.push(entry);
  }
  next.sort((a, b) => (a.valueDate < b.valueDate ? 1 : a.valueDate > b.valueDate ? -1 : a.currency.localeCompare(b.currency)));
  const trimmed = next.slice(0, 120);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    /* almacenamiento lleno o bloqueado: el histórico es informativo */
  }
  return trimmed;
}

function RatesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

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

  useEffect(() => {
    setHistory(mergeHistory(rates.data));
  }, [rates.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of history) {
      const list = map.get(e.valueDate) ?? [];
      list.push(e);
      map.set(e.valueDate, list);
    }
    return [...map.entries()];
  }, [history]);

  if (!ready) return null;

  const today = Object.entries(rates.data?.rates ?? {});

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> {t("backToDashboard")}
          </Link>
          <LangToggle />
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

        <section className="surface mt-6 p-6">
          <h2 className="text-xl">{t("fxHistory")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("fxHistoryNote")}</p>
          {grouped.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("fxHistoryEmpty")}</p>
          ) : (
            <div className="mt-4 space-y-4">
              {grouped.map(([date, entries]) => (
                <div key={date}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("valueDate")} {date}
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {entries.map((e) => (
                      <li
                        key={`${date}-${e.currency}`}
                        className="flex justify-between border-b border-border pb-2"
                      >
                        <span className="text-muted-foreground">
                          {e.currency} · {e.source}
                        </span>
                        <span>{formatFxRate(e.rate)} Bs.</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
