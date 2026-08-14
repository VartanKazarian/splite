import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import { applyRate, parseRate } from "@/lib/fiscal";
import {
  ApiError,
  formatBps,
  formatFxRate,
  formatMoney,
  guest,
  guestSession,
  parseMinorInput,
  type Bill,
  type MenuCurrency,
  type SplitMode,
  type SplitPreview,
} from "@/lib/api";


import { ErrorBox } from "@/routes/dashboard";
import { demoBill, demoSplit } from "@/lib/demo-bill";

/** Referencia visual en Bs de un importe cotizado, a la tasa congelada de la cuenta. */
function toVes(minor: string, rate: string | null): string {
  if (!rate) return "0";
  try {
    return applyRate(BigInt(minor), parseRate(rate)).toString();
  } catch {
    return "0";
  }
}

/** Lo que le toca a este comensal según el modo elegido. */
function myShare(preview: SplitPreview, mode: SplitMode): string {
  if (mode === "EQUAL") return preview.allocations[0]?.amountVes ?? "0";
  const mineAlloc = preview.allocations.find((a) => a.participantId === "me");
  return mineAlloc?.amountVes ?? preview.allocations[0]?.amountVes ?? "0";
}


export function GuestBillScreen({ qr, demo = false }: { qr?: string; demo?: boolean }) {
  const { t } = useI18n();
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<unknown>(null);

  // El QR trae un token firmado: se canjea una sola vez por sesión de invitado.
  useEffect(() => {
    if (demo) {
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const clean = () => {
        if (!qr || typeof window === "undefined") return;
        // El token no debe quedar en la barra de direcciones ni en capturas.
        const url = new URL(window.location.href);
        url.searchParams.delete("qr");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      };
      try {
        // Cualquier móvil, sin login: el token del QR siempre abre sesión nueva
        // (una sesión vieja en sessionStorage podría ser de otra mesa o estar caducada).
        if (qr) {
          guestSession.set(null);
          await guest.openSession(qr);
        }
        clean();
        if (!cancelled) setSessionReady(Boolean(guestSession.get()));
      } catch (error) {
        clean();
        if (!cancelled) setSessionError(error);
      }

    })();
    return () => {
      cancelled = true;
    };
  }, [qr, demo]);

  const billQuery = useQuery({
    queryKey: ["guest-bill", demo],
    enabled: sessionReady && !demo,
    retry: false,
    // El personal añade productos mientras la gente está sentada: sondeo cada 5s.
    refetchInterval: 5000,
    queryFn: async (): Promise<Bill | null> => {
      try {
        return await guest.bill<Bill>();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });


  const [mode, setMode] = useState<SplitMode>("FULL");
  const [diners, setDiners] = useState(2);
  // itemId -> unidades que paga este comensal
  const [mine, setMine] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  // Propina opcional del comensal, encima del cargo por servicio de la cuenta.
  const [tipPct, setTipPct] = useState<number | null>(0);
  const [tipCustom, setTipCustom] = useState("");

  const demoBillData = useMemo(() => (demo ? demoBill() : null), [demo]);
  const bill = demo ? demoBillData : (billQuery.data ?? null);
  const rateStr = bill?.fxRateVesPerUnit ?? bill?.fxRate ?? null;
  const showVes = Boolean(bill && bill.currency !== "VES" && rateStr);

  const splitMutation = useMutation({
    mutationFn: async () => {
      if (demo && bill) {
        return demoSplit(bill, mode, {
          diners,
          mine,
          amountMinor: parseMinorInput(amount) || "0",
        });
      }
      // Nadie escribe nombres: cada comensal usa el mismo QR y sólo marca lo suyo.
      const remaining = BigInt(bill?.remainingVes ?? bill?.totalDueVes ?? "0");
      let body: Record<string, unknown>;
      if (mode === "FULL") {
        body = { mode, participants: [{ id: "me" }] };
      } else if (mode === "EQUAL") {
        body = {
          mode,
          participants: Array.from({ length: Math.max(2, diners) }, (_, i) => ({ id: `p${i + 1}` })),
        };
      } else if (mode === "ITEMS") {
        body = {
          mode,
          participants: [{ id: "me" }, { id: "others" }],
          claims: (bill?.items ?? []).flatMap((item) => {
            const qty = mine[item.id] ?? 0;
            const rest = Math.max(0, (item.quantity ?? 1) - qty);
            return [
              ...(qty > 0
                ? [{ itemId: item.id, quantity: qty, participantIds: ["me"] }]
                : []),
              ...(rest > 0
                ? [{ itemId: item.id, quantity: rest, participantIds: ["others"] }]
                : []),
            ];
          }),
        };
      } else {
        const cents = BigInt(parseMinorInput(amount) || "0");
        const rest = remaining > cents ? remaining - cents : 0n;
        body = {
          mode,
          participants: [
            { id: "me", amountVes: cents.toString() },
            { id: "others", amountVes: rest.toString() },
          ],
        };
      }
      // El reparto lo calcula el servidor: nunca se divide en el cliente.
      return guest.splitPreview<SplitPreview>(body);
    },
    onSuccess: setPreview,
    onError: () => setPreview(null),
  });

  // El cálculo aparece solo tras la selección, sin botón intermedio.
  const canSplit =
    Boolean(bill) &&
    (mode === "FULL" ||
      (mode === "EQUAL" && diners >= 2) ||
      (mode === "ITEMS" && Object.values(mine).some((q) => q > 0)) ||
      (mode === "CUSTOM" && BigInt(parseMinorInput(amount) || "0") > 0n));
  const splitRef = useRef(splitMutation);
  splitRef.current = splitMutation;
  useEffect(() => {
    if (!canSplit) {
      setPreview(null);
      return;
    }
    const id = setTimeout(() => splitRef.current.mutate(), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSplit, mode, diners, JSON.stringify(mine), amount, bill?.totalDue, bill?.remainingVes]);


  const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : undefined);

  if (!demo && (sessionError || (!sessionReady && !qr))) {
    const code = codeOf(sessionError);
    return (
      <Shell>
        <h1 className="text-3xl">{t("yourBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {code === "QR_INVALID" || code === "QR_TOKEN_INVALID"
            ? t("qrInvalid")
            : code === "GUEST_SESSION_INVALID"
              ? t("sessionExpired")
              : t("scanNeeded")}
        </p>
        {sessionError && !code ? <ErrorBox error={sessionError} fallback={t("apiDown")} /> : null}
      </Shell>
    );
  }

  if (!demo && (!sessionReady || billQuery.isLoading)) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </Shell>
    );
  }

  if (!demo && billQuery.isError) {
    const code = codeOf(billQuery.error);
    if (code === "GUEST_SESSION_INVALID") {
      guestSession.set(null);
      return (
        <Shell>
          <h1 className="text-3xl">{t("yourBill")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("sessionExpired")}</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="text-3xl">{t("errorTitle")}</h1>
        <ErrorBox error={billQuery.error} fallback={t("apiDown")} />
      </Shell>
    );
  }

  if (!bill) {
    return (
      <Shell>
        <h1 className="text-3xl">{t("noOpenBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("oneOpenBill")}</p>
      </Shell>
    );
  }

  const modes: { id: SplitMode; label: string }[] = [
    { id: "FULL", label: t("payAll") },
    { id: "ITEMS", label: t("splitItems") },
    { id: "EQUAL", label: t("splitEven") },
    { id: "CUSTOM", label: t("custom") },
  ];

  // La propina se calcula en céntimos enteros sobre la parte del comensal.
  const shareMinor = preview ? BigInt(myShare(preview, mode)) : 0n;
  const tipMinor =
    tipPct === null
      ? (parseMinorInput(tipCustom) || "0")
      : ((shareMinor * BigInt(tipPct)) / 100n).toString();

  const setMineQty = (itemId: string, qty: number, max: number) =>
    setMine((prev) => {
      const next = { ...prev };
      const clamped = Math.max(0, Math.min(max, qty));
      if (clamped === 0) delete next[itemId];
      else next[itemId] = clamped;
      return next;
    });


  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16">
      <header className="flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("brand")}
        </Link>
        <LangToggle />
      </header>

      {demo && (
        <p className="mb-3 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("demoBanner")}
        </p>
      )}

      <div className="surface p-6">
        <h1 className="text-3xl">{t("yourBill")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("quotedIn")} {bill.currency}
        </p>

        <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          {(bill.items ?? []).map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span>{formatMoney(item.subtotalMinor, bill.currency)}</span>
                {showVes && (
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {formatMoney(toVes(item.subtotalMinor, rateStr), "VES")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>


        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
          <MoneyRow label={t("subtotal")} amount={bill.subtotalMinor} currency={bill.currency} />
          <MoneyRow
            label={`${t("iva")} ${formatBps(bill.vatBps)}`}
            amount={bill.vatMinor}
            currency={bill.currency}
          />
          <MoneyRow
            label={`${t("service")} ${formatBps(bill.serviceChargeBps)}`}
            amount={bill.serviceChargeMinor}
            currency={bill.currency}
          />
          <MoneyRow label={t("total")} amount={bill.totalDue} currency={bill.currency} highlight />
        </div>

        {bill.currency !== "VES" && (
          <div className="mt-4 space-y-1 border-t border-border pt-4">
            <div className="flex items-baseline justify-between text-foreground">
              <span className="text-xs uppercase tracking-widest">{t("totalPayable")}</span>
              <span className="font-display text-3xl">
                {formatMoney(bill.totalDueVes, "VES")}
              </span>
            </div>
            {(bill.fxRateVesPerUnit ?? bill.fxRate) && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("bcvRate")}</span>
                <span>{formatFxRate(bill.fxRateVesPerUnit ?? bill.fxRate!)}</span>
              </div>
            )}
          </div>
        )}

        {BigInt(bill.amountPaidVes ?? "0") > 0n && (
          <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
            <MoneyRow label={t("alreadyPaid")} amount={bill.amountPaidVes} currency="VES" />
            <div className="flex items-baseline justify-between pt-2 text-foreground">
              <span>{t("outstanding")}</span>
              <span className="font-display text-2xl">
                {formatMoney(bill.remainingVes, "VES")}
              </span>
            </div>
          </div>
        )}
      </div>


      <div className="surface mt-4 p-6">
        <div className="grid grid-cols-2 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMode(m.id);
                setPreview(null);
              }}
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

        {mode === "EQUAL" && (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("howManyDiners")}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <button
                onClick={() => setDiners((n) => Math.max(2, n - 1))}
                className="h-10 w-10 rounded-full border border-border text-lg text-muted-foreground"
              >
                −
              </button>
              <span className="font-display text-3xl">{diners}</span>
              <button
                onClick={() => setDiners((n) => Math.min(50, n + 1))}
                className="h-10 w-10 rounded-full border border-border text-lg text-muted-foreground"
              >
                +
              </button>
            </div>
          </div>
        )}

        {mode === "ITEMS" && (
          <div className="mt-5 space-y-2">
            <p className="text-xs text-muted-foreground">{t("selectYourItems")}</p>
            {(bill.items ?? []).map((item) => {
              const max = item.quantity ?? 1;
              const qty = mine[item.id] ?? 0;
              const on = qty > 0;
              const unit = (BigInt(item.subtotalMinor) * BigInt(qty)) / BigInt(max || 1);
              return (
                <div
                  key={item.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    on ? "border-primary bg-primary/15" : "border-border text-muted-foreground"
                  }`}
                >
                  <button
                    onClick={() => setMineQty(item.id, on ? 0 : max, max)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        on ? "border-primary bg-primary/40" : "border-border"
                      }`}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span>
                      {max} × {item.name}
                    </span>
                  </button>
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <button
                        aria-label="-"
                        onClick={() => setMineQty(item.id, qty - 1, max)}
                        disabled={qty <= 0}
                        className="h-7 w-7 rounded-full border border-border text-sm disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-5 text-center tabular-nums">{qty}</span>
                      <button
                        aria-label="+"
                        onClick={() => setMineQty(item.id, qty + 1, max)}
                        disabled={qty >= max}
                        className="h-7 w-7 rounded-full border border-border text-sm disabled:opacity-30"
                      >
                        +
                      </button>
                    </span>
                    <span className="w-20 shrink-0 text-right">
                      {formatMoney(unit.toString(), bill.currency)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {mode === "CUSTOM" && (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("yourAmount")}
            </p>
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-3 w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-sm outline-none focus:border-ring"
            />
          </div>
        )}

        {splitMutation.isPending && (
          <p className="mt-5 text-xs text-muted-foreground">{t("calculating")}</p>
        )}

        {splitMutation.isError && (
          <ErrorBox error={splitMutation.error} fallback={t("apiDown")} />
        )}

        {preview && !splitMutation.isPending && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {mode === "EQUAL" ? t("perPerson") : t("yourShare")}
              </span>
              <span className="font-display text-3xl">
                {formatMoney(myShare(preview, mode), "VES")}
              </span>
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>{t("outstanding")}</span>
              <span>{formatMoney(preview.outstandingVes, "VES")}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("allocated")}</span>
              <span>{formatMoney(preview.totalAllocatedVes, "VES")}</span>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("tipTitle")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("tipHint")}</p>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {[0, 5, 10, 15].map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setTipPct(p);
                      setTipCustom("");
                    }}
                    className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                      tipPct === p
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {p === 0 ? t("tipNone") : `${p}%`}
                  </button>
                ))}
                <button
                  onClick={() => setTipPct(null)}
                  className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                    tipPct === null
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t("tipOther")}
                </button>
              </div>
              {tipPct === null && (
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={tipCustom}
                  onChange={(e) => setTipCustom(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-sm outline-none focus:border-ring"
                />
              )}
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>{t("tipAmount")}</span>
                <span>{formatMoney(tipMinor, "VES")}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-foreground">
                <span className="text-xs uppercase tracking-widest">{t("yourTotalWithTip")}</span>
                <span className="font-display text-2xl">
                  {formatMoney((BigInt(myShare(preview, mode)) + BigInt(tipMinor)).toString(), "VES")}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{t("guestNoPay")}</p>
          </div>
        )}

      </div>
    </div>
  );
}

function MoneyRow({
  label,
  amount,
  currency,
  highlight,
}: {
  label: string;
  amount: string;
  currency: MenuCurrency;
  highlight?: boolean;
}) {
  return (
    <div className={`flex justify-between ${highlight ? "text-foreground" : ""}`}>
      <span>{label}</span>
      <span>{formatMoney(amount, currency)}</span>
    </div>
  );
}


function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5">
      <header className="flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Mesa
        </Link>
        <LangToggle />
      </header>
      <div className="surface p-6">{children}</div>
    </div>
  );
}
