import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { formatMoney, payments, type PaymentHistoryEntry } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { staffStrings } from "@/lib/i18n-staff";
import { businessDayKey, formatTime, formatWeekday } from "@/lib/dates";

/** Los periodos que se ofrecen. Siete por defecto; noventa es el tope del servidor. */
const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
const RANGE_KEY = {
  7: "historyRange7",
  30: "historyRange30",
  90: "historyRange90",
} as const;

/** Lo que no es dinero entrado se dice; lo cobrado va sin etiqueta, que es lo normal. */
const QUIET = new Set(["SUCCEEDED"]);
const BAD = new Set(["FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]);

/**
 * Los cobros de la última semana, y más atrás si hace falta.
 *
 * Sustituye en Pagos a la lista de los últimos veinte movimientos: veinte no
 * llegan ni a un turno lleno, y la pregunta que se hace en esta pantalla es
 * «¿entró el pago del martes?», no sólo «¿qué acaba de pasar?». Por eso enseña
 * todos los cobros, en cualquier estado -- un Pago Móvil rechazado es
 * justamente lo que se viene a buscar -- agrupados por día del local.
 *
 * Arriba, lo recibido en todo el periodo, que no cambia al cargar más páginas.
 */
export function PaymentHistory() {
  const { t, lang } = useI18n(staffStrings);
  const [days, setDays] = useState<Range>(7);

  const history = useInfiniteQuery({
    queryKey: ["payments-history", days],
    queryFn: ({ pageParam }) => payments.history(days, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
    // Lo nuevo entra arriba sin tocar nada; un minuto basta para un registro.
    refetchInterval: 60000,
  });

  const first = history.data?.pages[0];
  const rows: PaymentHistoryEntry[] = history.data?.pages.flatMap((p) => p.data) ?? [];

  const today = businessDayKey(new Date().toISOString());
  const yesterday = businessDayKey(new Date(Date.now() - 86400000).toISOString());
  const groups: { key: string; label: string; rows: PaymentHistoryEntry[] }[] = [];
  for (const r of rows) {
    const key = businessDayKey(r.at);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const label =
        key === today
          ? t("historyToday")
          : key === yesterday
            ? t("historyYesterday")
            : formatWeekday(r.at, lang);
      g = { key, label, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }

  return (
    <section id="historial" className="surface p-5">
      <h2 className="inline-flex items-center gap-2 text-xl">
        <History className="h-5 w-5 text-muted-foreground" /> {t("historyTitle")}
      </h2>

      <div
        role="group"
        aria-label={t("historyRangeLabel")}
        className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {RANGES.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-xs transition-colors ${
              days === d
                ? "border-primary bg-primary/10 font-medium text-primary-ink"
                : "border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {t(RANGE_KEY[d])}
          </button>
        ))}
      </div>

      {first && (
        <p className="mt-4 text-sm">
          <span className="text-muted-foreground">{t("historyReceived")} </span>
          <span className="figure text-base font-medium">
            {formatMoney(first.totals.succeededVes, "VES")}
          </span>
          {BigInt(first.totals.tipVes) > 0n && (
            <span className="whitespace-nowrap text-muted-foreground">
              {" · "}
              {t("historyTips").replace("{amount}", formatMoney(first.totals.tipVes, "VES"))}
            </span>
          )}
        </p>
      )}

      {history.isLoading && <p className="mt-3 text-sm text-muted-foreground">{t("loading")}</p>}
      {history.isError && !history.data && (
        <p className="mt-3 text-sm text-destructive">{t("historyError")}</p>
      )}
      {first && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{t("historyEmpty")}</p>
      )}

      {groups.map((g) => (
        <div key={g.key} className="mt-5">
          <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground first-letter:uppercase">
            {g.label}
          </h3>
          {/* Como el movimiento: arriba qué y cuánto, con el importe siempre
              en la misma columna; debajo, en gris, la hora y por qué vía. */}
          <ul className="mt-2 space-y-2 text-sm">
            {g.rows.map((r) => {
              const bad = BAD.has(r.status);
              return (
                <li
                  key={r.paymentId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-border pb-2 last:border-0"
                >
                  <span className="min-w-0 truncate">
                    {r.tableName ?? "—"}
                    {!QUIET.has(r.status) && (
                      <span
                        className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] ${
                          bad
                            ? "border-destructive/50 text-destructive"
                            : "border-amber-500/50 text-muted-foreground"
                        }`}
                      >
                        {t(`historyStatus${r.status}` as never)}
                      </span>
                    )}
                  </span>
                  <span
                    className={`figure shrink-0 ${bad ? "text-muted-foreground line-through" : ""}`}
                  >
                    {formatMoney(r.amountVes, "VES")}
                  </span>
                  <span className="col-span-2 mt-0.5 text-xs text-muted-foreground">
                    {formatTime(r.at, lang)} · {t(`method${r.paymentMethod}` as never)}
                    {r.reference && <> · {t("historyRef").replace("{ref}", r.reference)}</>}
                    {BigInt(r.tipVes) > 0n && (
                      <>
                        {" "}
                        · {t("tip")} <span className="figure">+{formatMoney(r.tipVes, "VES")}</span>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {history.hasNextPage && (
        <button
          type="button"
          onClick={() => history.fetchNextPage()}
          disabled={history.isFetchingNextPage}
          className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm hover:bg-secondary disabled:opacity-50"
        >
          {history.isFetchingNextPage ? t("loading") : t("historyMore")}
        </button>
      )}
    </section>
  );
}
