import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, CreditCard, Smartphone, Banknote, ArrowLeftRight, ArrowLeft } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { useI18n, type Key } from "@/lib/i18n";
import { getTable, restaurant } from "@/lib/mock-data";
import {
  CURRENCY_SYMBOL,
  applyRate,
  computeBreakdown,
  fmt,
  fmtVes,
  parseRate,
  quoteReference,
  splitEvenly,
  type PaymentMethod,
  type TenderCurrency,
} from "@/lib/fiscal";

export const Route = createFileRoute("/t/$tableId")({
  head: () => ({
    meta: [
      { title: "Tu cuenta — Mesa" },
      {
        name: "description",
        content: "Ve tu cuenta, divídela con tus acompañantes, deja propina y paga desde tu móvil.",
      },
      { property: "og:title", content: "Tu cuenta — Mesa" },
      { property: "og:description", content: "Divide la cuenta, deja propina y paga desde tu móvil." },
    ],
  }),
  component: GuestBill,
});

type Mode = "all" | "items" | "even" | "custom";
type Tender = { method: PaymentMethod; currency: TenderCurrency; labelKey: Key; icon: typeof Smartphone };

const TENDERS: Tender[] = [
  { method: "PAGO_MOVIL", currency: "VES", labelKey: "methodPAGO_MOVIL", icon: Smartphone },
  { method: "CARD", currency: "VES", labelKey: "methodCARD", icon: CreditCard },
  { method: "TRANSFER", currency: "VES", labelKey: "methodTRANSFER", icon: ArrowLeftRight },
  { method: "CASH", currency: "USD", labelKey: "methodCASH", icon: Banknote },
];

function GuestBill() {
  const { tableId } = Route.useParams();
  const { t, lang } = useI18n();
  const table = getTable(tableId) ?? getTable("15")!;
  const bill = table.bill;

  const [mode, setMode] = useState<Mode>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [people, setPeople] = useState(3);
  const [shares, setShares] = useState(1);
  const [customAmount, setCustomAmount] = useState("10");
  const [tipPct, setTipPct] = useState(10);
  const [tenderIdx, setTenderIdx] = useState(0);
  const [done, setDone] = useState<null | { ves: bigint; key: string }>(null);

  const sym = CURRENCY_SYMBOL[restaurant.menuCurrency];
  const scaledRate = bill?.fxRateVesPerUnit ? parseRate(bill.fxRateVesPerUnit) : null;
  const items = bill?.items ?? [];
  const unpaid = items.filter((i) => !i.paid);
  const paidMinor = items.filter((i) => i.paid).reduce((a, i) => a + i.priceMinor, 0n);
  const dueMinor = unpaid.reduce((a, i) => a + i.priceMinor, 0n);
  const toVes = (minor: bigint) => (scaledRate ? applyRate(minor, scaledRate) : minor);
  const dueVes = toVes(dueMinor);

  const tender = TENDERS[tenderIdx]!;

  /** La base se calcula en céntimos VES: la liquidación es siempre en bolívares. */
  const baseVes = useMemo(() => {
    if (mode === "all") return dueVes;
    if (mode === "items")
      return toVes(unpaid.filter((i) => picked.includes(i.id)).reduce((a, i) => a + i.priceMinor, 0n));
    if (mode === "even") {
      const parts = splitEvenly(dueVes, people);
      return parts.slice(0, shares).reduce((a, b) => a + b, 0n);
    }
    const n = Number(customAmount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0n;
    const asked = toVes(BigInt(Math.round(n * 100)));
    return asked > dueVes ? dueVes : asked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dueVes, picked, people, shares, customAmount]);

  const b = useMemo(
    () => computeBreakdown({ baseVes, tipBps: tipPct * 100, tenderCurrency: tender.currency }),
    [baseVes, tipPct, tender.currency],
  );

  const totalRef = quoteReference(b.total, scaledRate);

  if (!bill || bill.status !== "OPEN") {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 text-center">
        <div className="surface max-w-sm p-9">
          <h1 className="text-3xl">
            {t("table")} {table.number}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("free")} — {t("oneOpenBill")}.</p>
          <Link to="/" className="mt-6 inline-block rounded-full border border-border px-5 py-3 text-sm">
            {t("brand")}
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
        <div className="surface w-full max-w-sm p-9 shadow-[var(--shadow-glow)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/20 text-success">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-4xl">{t("thanks")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("thanksSub")}</p>
          <p className="mt-6 font-display text-4xl">Bs. {fmtVes(done.ves)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("payStatusSUCCEEDED")} · {t("payerGUEST")}
          </p>
          <p className="mt-4 break-all text-[11px] text-muted-foreground">
            {t("idemKey")}: {done.key}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("idemNote")}</p>
          <button
            onClick={() => setDone(null)}
            className="mt-7 w-full rounded-full border border-border px-5 py-3 text-sm transition-colors hover:bg-secondary"
          >
            {t("backToBill")}
          </button>
        </div>
      </div>
    );
  }

  const modes: { id: Mode; label: string }[] = [
    { id: "all", label: t("payAll") },
    { id: "items", label: t("splitItems") },
    { id: "even", label: t("splitEven") },
    { id: "custom", label: t("custom") },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-52">
      <header className="flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("brand")}
        </Link>
        <LangToggle />
      </header>

      <div className="surface p-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{restaurant.name}</p>
        <h1 className="mt-1 text-3xl">
          {t("table")} {table.number} · {t("yourBill")}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("quotedIn")} {restaurant.menuCurrency} · {t("frozenRate")}: {bill.fxRateVesPerUnit} Bs./
          {restaurant.menuCurrency} ({t("valueDate")} {bill.fxValueDate})
        </p>

        <ul className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
          {items.map((item) => {
            const selectable = mode === "items" && !item.paid;
            const isPicked = picked.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  disabled={!selectable}
                  onClick={() =>
                    setPicked((p) => (isPicked ? p.filter((x) => x !== item.id) : [...p, item.id]))
                  }
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    selectable ? "hover:bg-secondary" : ""
                  } ${isPicked && selectable ? "bg-primary/15" : ""} ${item.paid ? "opacity-45" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    {selectable && (
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          isPicked ? "border-primary bg-primary" : "border-border"
                        }`}
                      >
                        {isPicked && <Check className="h-3 w-3 text-primary-foreground" />}
                      </span>
                    )}
                    <span className={item.paid ? "line-through" : ""}>{item.name[lang]}</span>
                  </span>
                  <span className="text-right">
                    Bs. {fmtVes(toVes(item.priceMinor))}
                    <span className="block text-[10px] text-muted-foreground">
                      {sym}
                      {fmt(item.priceMinor)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
          {paidMinor > 0n && (
            <div className="flex justify-between">
              <span>{t("alreadyPaid")}</span>
              <span className="text-success">Bs. {fmtVes(toVes(paidMinor))}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t("remaining")}</span>
            <span className="text-foreground">Bs. {fmtVes(dueVes)}</span>
          </div>
        </div>
      </div>

      <div className="surface mt-4 p-6">
        <div className="grid grid-cols-2 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                mode === m.id
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "even" && (
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("people")}</span>
              <Stepper
                value={people}
                min={2}
                max={12}
                onChange={(v) => {
                  setPeople(v);
                  if (shares > v) setShares(v);
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("yourShare")}</span>
              <Stepper value={shares} min={1} max={people} onChange={setShares} />
            </div>
            <p className="text-[11px] text-muted-foreground">{t("largestRemainder")}.</p>
          </div>
        )}

        {mode === "custom" && (
          <div className="mt-5">
            <div className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-4 py-3">
              <span className="text-muted-foreground">{sym}</span>
              <input
                inputMode="decimal"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full bg-transparent text-lg outline-none"
              />
            </div>
          </div>
        )}

        {mode === "items" && picked.length === 0 && (
          <p className="mt-4 text-xs text-muted-foreground">{t("selectSome")}</p>
        )}

        <div className="mt-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("tip")}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[0, 10, 15, 20].map((p) => (
              <button
                key={p}
                onClick={() => setTipPct(p)}
                className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                  tipPct === p
                    ? "border-accent bg-accent/15 text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-1 border-t border-border pt-4 text-sm">
          <p className="pb-1 text-xs uppercase tracking-widest text-muted-foreground">{t("breakdown")}</p>
          <Row label={t("taxBase")} value={fmtVes(b.base)} />
          <Row label={t("service")} value={fmtVes(b.service)} />
          <Row label={t("iva")} value={fmtVes(b.iva)} />
          {b.igtf > 0n && <Row label={t("igtf")} value={fmtVes(b.igtf)} />}
          <Row label={t("tip")} value={fmtVes(b.tip)} />
          <div className="flex items-baseline justify-between pt-2">
            <span>{t("total")}</span>
            <span className="font-display text-3xl">Bs. {fmtVes(b.total)}</span>
          </div>
          {totalRef && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("reference")}</span>
              <span>
                {sym}
                {totalRef}
              </span>
            </div>
          )}
          <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
            {t("settlementVes")}. {t("settlementNote")} {t("tipNote")}.
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("payWith")}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {TENDERS.map((m, i) => (
              <button
                key={m.method}
                onClick={() => setTenderIdx(i)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] transition-colors ${
                  tenderIdx === i
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <m.icon className="h-4 w-4" />
                <span className="truncate">{t(m.labelKey)}</span>
                <span className="text-[9px] opacity-70">{m.currency}</span>
              </button>
            ))}
          </div>
          {tender.currency !== "VES" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("igtfNote")} · {t("tender")}: {CURRENCY_SYMBOL[tender.currency]}
              {quoteReference(b.total, scaledRate)} @ {bill.fxRateVesPerUnit}
            </p>
          )}
          <button
            disabled={b.total <= 0n}
            onClick={() =>
              setDone({
                ves: b.total,
                key: `${bill.id}-${Math.random().toString(36).slice(2, 10)}`,
              })
            }
            className="mt-3 w-full rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("payNow")} Bs. {fmtVes(b.total)}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>Bs. {value}</span>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-border px-2 py-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-6 w-6 rounded-full text-muted-foreground hover:bg-secondary"
      >
        −
      </button>
      <span className="w-5 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="h-6 w-6 rounded-full text-muted-foreground hover:bg-secondary"
      >
        +
      </button>
    </div>
  );
}
