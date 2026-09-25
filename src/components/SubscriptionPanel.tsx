import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  formatMoney,
  parseMinorInput,
  subscription,
  type SubscriptionNotice,
  type SubscriptionView,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const field =
  "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring";

/** Hoy en Caracas, AAAA-MM-DD. */
function caracasToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function day(isoDay: string, lang: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(lang === "en" ? "en-GB" : "es-VE", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Lo que el restaurante le paga a Splite, dicho sin rodeos: cuánto, hasta
 * cuándo, a dónde y cómo avisar. Es la misma mecánica que sus comensales usan
 * con él -- pagar por el banco y avisar --, así que no hay nada nuevo que
 * aprender.
 */
export function SubscriptionPanel() {
  const { t, lang } = useI18n();
  const query = useQuery({ queryKey: ["subscription"], queryFn: () => subscription.get() });
  const [notifyOpen, setNotifyOpen] = useState(false);

  if (query.isError) {
    return (
      <section className="surface mt-4 p-6">
        <p className="text-sm text-destructive">{t("apiUnreachable")}</p>
      </section>
    );
  }
  if (!query.data) {
    return (
      <section className="surface mt-4 p-6">
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </section>
    );
  }

  const { subscription: sub, charges, notices, paymentDetails } = query.data;
  const usd = (cents: string) => formatMoney(cents, "USD");
  const owes = BigInt(sub.balanceUsd) > 0n;
  const open = charges.filter((c) => c.status === "OPEN");

  return (
    <section className="surface mt-4 p-6" data-testid="subscription-panel">
      <h2 className="text-xl">{t("subTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subIntro")}</p>

      {(sub.status !== "ACTIVE" || sub.state === "OVERDUE") && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {sub.status === "SUSPENDED"
            ? t("subStateSuspended")
            : sub.status === "CANCELLED"
              ? t("subStateCancelled")
              : t("subStateOverdue")}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("subPlan")}</dt>
          <dd className="mt-0.5 font-medium">{sub.tier}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("subPrice")}</dt>
          <dd className="mt-0.5">
            {sub.priceUsd
              ? `${usd(sub.priceUsd)}${sub.billingCycle === "ANNUAL" ? t("subPerYear") : t("subPerMonth")}`
              : sub.trialEndsAt
                ? t("subTrialUntil").replace("{date}", day(sub.trialEndsAt.slice(0, 10), lang))
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("subBalance")}</dt>
          <dd
            className={`mt-0.5 ${owes ? "font-medium text-destructive" : ""}`}
            data-testid="subscription-balance"
          >
            {owes ? usd(sub.balanceUsd) : t("subUpToDate")}
            {owes && sub.balanceVesToday && (
              <span className="block text-xs text-muted-foreground">
                {t("subVesToday").replace("{amount}", formatMoney(sub.balanceVesToday, "VES"))}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {charges.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium">{t("subCharges")}</h3>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {charges.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
              >
                <span>
                  {day(c.periodStart, lang)} → {day(c.periodEnd, lang)}
                  <span className="block text-xs text-muted-foreground">
                    {t("subDue").replace("{date}", day(c.dueOn, lang))}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {usd(c.amountUsd)}
                  <span
                    className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] ${
                      c.status === "PAID"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : c.overdue
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-amber-500/50 bg-amber-500/10 text-amber-800"
                    }`}
                  >
                    {c.status === "PAID"
                      ? t("subPaid")
                      : c.overdue
                        ? t("subOverdueChip")
                        : t("subPending")}
                  </span>
                  {c.status === "OPEN" && BigInt(c.paidUsd) > 0n && (
                    <span className="block text-xs text-muted-foreground">
                      {t("subRemaining").replace("{amount}", usd(c.remainingUsd))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-6 text-sm font-medium">{t("subPayTo")}</h3>
      {paymentDetails ? (
        <PayTo details={paymentDetails} />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("subPayMissing")}</p>
      )}

      {owes && (
        <div className="mt-5">
          {notifyOpen ? (
            <NotifyForm open={open} onDone={() => setNotifyOpen(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setNotifyOpen(true)}
              className="btn-primary"
              data-testid="subscription-notify"
            >
              {t("subNotify")}
            </button>
          )}
        </div>
      )}

      {notices.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium">{t("subNotices")}</h3>
          <ul className="mt-2 space-y-2 text-sm" data-testid="subscription-notices">
            {notices.map((n) => (
              <NoticeRow key={n.id} n={n} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PayTo({ details }: { details: NonNullable<SubscriptionView["paymentDetails"]> }) {
  const { t } = useI18n();
  const rows = (
    [
      [t("subPayHolder"), details.holder],
      [t("subPayId"), details.idNumber],
      [t("subPayBank"), [details.bankName, details.bankCode].filter(Boolean).join(" · ") || null],
      [t("subPayPhone"), details.phone],
      [t("subPayAccount"), details.accountNumber],
      [t("subPayZelle"), details.zelle],
    ] as const
  ).filter(([, v]) => v);
  const copy = (value: string) =>
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast.success(t("subCopied")))
      .catch(() => undefined);
  return (
    <div className="mt-2 rounded-lg bg-secondary p-4" data-testid="subscription-payto">
      <dl className="grid gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="flex items-center gap-2 font-medium">
              {value}
              <button
                type="button"
                onClick={() => copy(String(value))}
                aria-label={`${t("subCopy")}: ${label}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </dd>
          </div>
        ))}
      </dl>
      {details.notes && <p className="mt-3 text-xs text-muted-foreground">{details.notes}</p>}
    </div>
  );
}

function NoticeRow({ n }: { n: SubscriptionNotice }) {
  const { t, lang } = useI18n();
  const [label, tone] =
    n.status === "CONFIRMED"
      ? [t("subNoticeConfirmed"), "text-primary"]
      : n.status === "REJECTED"
        ? [t("subNoticeRejected").replace("{reason}", n.rejectReason ?? ""), "text-destructive"]
        : [t("subNoticePending"), "text-amber-800"];
  return (
    <li className="rounded-lg border border-border px-4 py-2.5">
      <span className="tabular-nums">{formatMoney(n.amount, n.currency)}</span>
      <span className="text-muted-foreground">
        {" "}
        · {day(n.paidOn, lang)}
        {n.reference ? ` · ref ${n.reference}` : ""}
      </span>
      <span className={`block text-xs ${tone}`}>{label}</span>
    </li>
  );
}

function NotifyForm({ open, onDone }: { open: SubscriptionView["charges"]; onDone: () => void }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [chargeId, setChargeId] = useState(open[0]?.id ?? "");
  const [currency, setCurrency] = useState<"VES" | "USD">("VES");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(caracasToday());
  const minor = amount.trim() ? parseMinorInput(amount) : "";

  const send = useMutation({
    mutationFn: () =>
      subscription.notify({
        chargeId: chargeId || null,
        method: currency === "VES" ? "PAGO_MOVIL" : "ZELLE",
        currency,
        amount: minor,
        reference: reference.trim() || null,
        paidOn,
      }),
    onSuccess: () => {
      toast.success(t("subNotifySent"));
      void qc.invalidateQueries({ queryKey: ["subscription"] });
      onDone();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.code === "SUBSCRIPTION_NOTICE_DUPLICATE"
          ? t("subNotifyDuplicate")
          : e instanceof ApiError
            ? `${e.code} · ${e.message}`
            : t("apiUnreachable"),
      ),
  });

  return (
    <div className="rounded-lg border border-border p-4" data-testid="subscription-notify-form">
      <p className="text-sm font-medium">{t("subNotifyTitle")}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("subNotifyHint")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {open.length > 0 && (
          <label className="grid gap-1 text-sm sm:col-span-2">
            {t("subNotifyCharge")}
            <select
              value={chargeId}
              onChange={(e) => setChargeId(e.target.value)}
              className={field}
            >
              {open.map((c) => (
                <option key={c.id} value={c.id}>
                  {day(c.periodStart, lang)} · {formatMoney(c.remainingUsd, "USD")}
                  {c.remainingVesToday ? ` ≈ ${formatMoney(c.remainingVesToday, "VES")}` : ""}
                </option>
              ))}
              <option value="">{t("subNotifyOnAccount")}</option>
            </select>
          </label>
        )}
        <label className="grid gap-1 text-sm">
          {t("subNotifyCurrency")}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "VES" | "USD")}
            className={field}
          >
            <option value="VES">{t("subCurrencyVES")}</option>
            <option value="USD">{t("subCurrencyUSD")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t("subNotifyAmount")}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={field}
            data-testid="subscription-notify-amount"
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("subNotifyReference")}
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={field}
            data-testid="subscription-notify-reference"
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("subNotifyDate")}
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={send.isPending || !minor || minor === "0"}
          onClick={() => send.mutate()}
          className="btn-primary"
          data-testid="subscription-notify-send"
        >
          {t("subNotifySend")}
        </button>
        <button type="button" onClick={onDone} className="btn-choice">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
