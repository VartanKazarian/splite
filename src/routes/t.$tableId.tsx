import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, CreditCard, Smartphone, Apple, ArrowLeft } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import { getTable, restaurant } from "@/lib/mock-data";

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
  loader: ({ params }) => {
    if (!getTable(params.tableId)) throw notFound();
    return null;
  },
  component: GuestBill,
});

type Mode = "all" | "items" | "even" | "custom";

function GuestBill() {
  const { tableId } = Route.useParams();
  const { t, lang } = useI18n();
  const table = getTable(tableId)!;

  const [mode, setMode] = useState<Mode>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [people, setPeople] = useState(3);
  const [shares, setShares] = useState(1);
  const [customAmount, setCustomAmount] = useState("10");
  const [tipPct, setTipPct] = useState(10);
  const [done, setDone] = useState<null | string>(null);

  const unpaid = table.items.filter((i) => !i.paid);
  const paidTotal = table.items.filter((i) => i.paid).reduce((a, i) => a + i.price, 0);
  const billTotal = unpaid.reduce((a, i) => a + i.price, 0);

  const base = useMemo(() => {
    if (mode === "all") return billTotal;
    if (mode === "items") return unpaid.filter((i) => picked.includes(i.id)).reduce((a, i) => a + i.price, 0);
    if (mode === "even") return (billTotal / people) * shares;
    const n = Number(customAmount.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.min(n, billTotal) : 0;
  }, [mode, billTotal, unpaid, picked, people, shares, customAmount]);

  const tip = (base * tipPct) / 100;
  const total = base + tip;

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
        <div className="surface w-full max-w-sm p-9 shadow-[var(--shadow-glow)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/20 text-success">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-4xl">{t("thanks")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("thanksSub")}</p>
          <p className="mt-6 font-display text-4xl">${done}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("receipt")}</p>
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
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-40">
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

        <ul className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
          {table.items.map((item) => {
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
                  } ${isPicked && selectable ? "bg-primary/15" : ""} ${
                    item.paid ? "opacity-45" : ""
                  }`}
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
                  <span>${item.price.toFixed(2)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
          {paidTotal > 0 && (
            <div className="flex justify-between">
              <span>{t("alreadyPaid")}</span>
              <span className="text-success">${paidTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t("remaining")}</span>
            <span className="text-foreground">${billTotal.toFixed(2)}</span>
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
              <Stepper value={people} min={2} max={12} onChange={(v) => {
                setPeople(v);
                if (shares > v) setShares(v);
              }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("yourShare")}</span>
              <Stepper value={shares} min={1} max={people} onChange={setShares} />
            </div>
          </div>
        )}

        {mode === "custom" && (
          <div className="mt-5">
            <div className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-4 py-3">
              <span className="text-muted-foreground">$</span>
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
          <div className="flex justify-between text-muted-foreground">
            <span>{t("subtotal")}</span>
            <span>${base.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("tip")}</span>
            <span>${tip.toFixed(2)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-2">
            <span>{t("total")}</span>
            <span className="font-display text-3xl">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("payWith")}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[
              { icon: Smartphone, label: t("mobile") },
              { icon: CreditCard, label: t("card") },
              { icon: Apple, label: "Apple Pay" },
              { icon: CreditCard, label: "Google Pay" },
            ].map((m) => (
              <div
                key={m.label}
                className="flex flex-col items-center gap-1 rounded-lg border border-border px-1 py-2 text-[10px] text-muted-foreground"
              >
                <m.icon className="h-4 w-4" />
                <span className="truncate">{m.label}</span>
              </div>
            ))}
          </div>
          <button
            disabled={total <= 0}
            onClick={() => setDone(total.toFixed(2))}
            className="mt-3 w-full rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("payNow")} ${total.toFixed(2)}
          </button>
        </div>
      </div>
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
