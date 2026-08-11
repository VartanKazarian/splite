import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Clock, LogOut } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { QrCode } from "@/components/QrCode";
import { useI18n } from "@/lib/i18n";
import { getSession, signOut } from "@/lib/auth";
import { restaurant, staff, stats, tables, dueMinor, type TableInfo } from "@/lib/mock-data";
import { BCV_RATES, CURRENCY_SYMBOL, applyRate, fmt, fmtVes, parseRate } from "@/lib/fiscal";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel del restaurante — Mesa" },
      {
        name: "description",
        content: "Mesas abiertas, códigos QR, cuentas y pagos en tiempo real del restaurante.",
      },
      { property: "og:title", content: "Panel del restaurante — Mesa" },
      { property: "og:description", content: "Mesas abiertas, QR, cuentas y pagos en vivo." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [user, setUser] = useState<string | null>(null);
  const [selected, setSelected] = useState<TableInfo>(tables[0]!);

  useEffect(() => {
    const session = getSession();
    if (!session) navigate({ to: "/login" });
    else setUser(session);
  }, [navigate]);

  if (!user) return null;

  const isPartial = (tb: TableInfo) => (tb.bill?.payments ?? []).some((p) => p.status === "SUCCEEDED");

  const statusLabel = (tb: TableInfo) =>
    !tb.bill ? t("free") : isPartial(tb) ? t("partial") : t("statusOPEN");

  const statusClass = (tb: TableInfo) =>
    !tb.bill
      ? "bg-secondary text-muted-foreground"
      : isPartial(tb)
        ? "bg-accent/20 text-accent"
        : "bg-primary/20 text-primary";

  const sym = CURRENCY_SYMBOL[restaurant.menuCurrency];
  const rateOf = (tb: TableInfo) =>
    tb.bill?.fxRateVesPerUnit ? parseRate(tb.bill.fxRateVesPerUnit) : null;
  const dueVes = (tb: TableInfo) => {
    const r = rateOf(tb);
    const minor = dueMinor(tb);
    return r ? applyRate(minor, r) : minor;
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <Link to="/" className="font-display text-2xl">
              {t("brand")}
            </Link>
            <span className="ml-3 text-sm text-muted-foreground">{restaurant.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <LangToggle />
            <button
              onClick={() => {
                signOut();
                navigate({ to: "/" });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" /> {t("logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-3xl">{t("dashboard")}</h1>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t("todaySales"), value: `Bs. ${stats.sales}` },
            { label: t("avgTip"), value: stats.tip },
            { label: t("openTables"), value: stats.open },
            { label: t("tickets"), value: stats.tickets },
          ].map((s) => (
            <div key={s.label} className="surface p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className="mt-2 font-display text-3xl">{s.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <h2 className="mb-3 text-xl">{t("tables")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {tables.map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setSelected(tb)}
                  className={`surface p-5 text-left transition-colors hover:border-primary ${
                    selected.id === tb.id ? "border-primary" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-2xl">
                      {t("table")} {tb.number}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${statusClass(tb)}`}
                    >
                      {statusLabel(tb)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {tb.bill?.guests ?? 0}/{tb.seats}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {tb.bill?.openedAt ?? "—"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm">
                    {tb.bill ? (
                      <>
                        <span className="text-foreground">Bs. {fmtVes(dueVes(tb))}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {sym}
                          {fmt(dueMinor(tb))}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <aside className="surface h-fit p-6 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("qrFor")}</p>
            <p className="mt-1 font-display text-3xl">
              {t("table")} {selected.number}
            </p>
            <div className="mt-5 flex justify-center">
              <QrCode value={`mesa-${selected.id}`} size={168} />
            </div>
            <ul className="mt-5 space-y-1 text-left text-sm text-muted-foreground">
              {(selected.bill?.items ?? []).map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className={i.paid ? "line-through" : ""}>{i.name[lang]}</span>
                  <span>
                    {sym}
                    {fmt(i.priceMinor)}
                  </span>
                </li>
              ))}
              {!selected.bill && <li>{t("free")}</li>}
            </ul>

            {selected.bill && (
              <div className="mt-5 border-t border-border pt-4 text-left text-xs">
                <p className="uppercase tracking-widest text-muted-foreground">{t("payments")}</p>
                {selected.bill.payments.length === 0 && (
                  <p className="mt-2 text-muted-foreground">{t("noPayments")}</p>
                )}
                <ul className="mt-2 space-y-2">
                  {selected.bill.payments.map((p) => (
                    <li key={p.id} className="rounded-lg bg-secondary/60 p-3">
                      <div className="flex justify-between">
                        <span>{t(`method${p.method}` as never)}</span>
                        <span>Bs. {fmtVes(p.amountVes)}</span>
                      </div>
                      <div className="mt-1 flex justify-between text-muted-foreground">
                        <span>
                          {t(`payStatus${p.status}` as never)} · {t(`payer${p.payerType}` as never)}
                        </span>
                        <span>{p.at}</span>
                      </div>
                      {p.tender && (
                        <p className="mt-1 text-muted-foreground">
                          {t("tender")}: {CURRENCY_SYMBOL[p.tender.currency]}
                          {fmt(p.tender.amount)} @ {p.tender.fxRate}
                        </p>
                      )}
                      <p className="mt-1 break-all text-[10px] text-muted-foreground">
                        {t("idemKey")}: {p.idempotencyKey}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link
              to="/t/$tableId"
              params={{ tableId: selected.id }}
              className="mt-6 inline-block w-full rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("viewTable")}
            </Link>
          </aside>
        </section>
        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="surface p-6">
            <h2 className="text-xl">{t("exchangeRate")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("fxSource")}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {(["USD", "EUR"] as const).map((c) => (
                <li key={c} className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">
                    {c} · {t("valueDate")} {BCV_RATES[c].valueDate}
                  </span>
                  <span>{BCV_RATES[c].rate} Bs.</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("quotedIn")} {restaurant.menuCurrency} · {t("settlementVes")} · {t("oneOpenBill")}
            </p>
          </div>

          <div className="surface p-6">
            <h2 className="text-xl">{t("team")}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {staff.map((u) => (
                <li key={u.email} className="flex justify-between border-b border-border pb-2">
                  <span>
                    {u.name}
                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="text-muted-foreground">{t(`role${u.role}` as never)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
