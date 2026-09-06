import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";

import { GuestC2PForm } from "@/components/GuestC2PForm";
import { useI18n } from "@/lib/i18n";

import {
  ApiError,
  formatMinor,
  formatMoney,
  guest,
  parseMinorInput,
  type Bill,
  type PaymentClaim,
  type Payee,
} from "@/lib/api";

/** 04121234567 -> 0412-123.45.67 (sólo para leer; se copia en crudo). */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return raw;
  return `${d.slice(0, 4)}-${d.slice(4, 7)}.${d.slice(7, 9)}.${d.slice(9)}`;
}

function CopyRow({
  label,
  display,
  copyValue,
  lead,
}: {
  label: string;
  display: string;
  copyValue: string;
  /** El importe: una fila por tarjeta se lleva la cifra grande. */
  lead?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const { t } = useI18n();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={`flex gap-3 border-b border-border py-2.5 last:border-b-0 ${
        lead ? "flex-col" : "items-center justify-between"
      }`}
    >
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-2 ${lead ? "justify-between" : ""}`}>
        {/* El monto es lo que se teclea en el banco, y medía 14 px como el
            código de la sucursal. Sube a la escala grande y se lleva la fila
            entera; los otros tres datos se quedan como estaban. */}
        <span className={lead ? "money-lg" : "money-md"}>{display}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copiar ${label}`}
          // 44 px. Copiar el banco, el teléfono y el RIF es literalmente el
          // trámite del Pago Móvil: se hace tres veces seguidas, de pie y con
          // el banco abierto al lado. Fallar el toque cuesta volver a empezar.
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-secondary"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied && <span>{t("copied")}</span>}
        </button>
      </span>
    </div>
  );
}

type ClaimError = {
  code?: string;
  message: string;
  requestId?: string;
  fields?: string[];
  suggestVes?: string;
};

/** El traductor va por parámetro: esto no es un componente y no puede usar el hook. */
function toClaimError(error: unknown, t: (k: never) => string): ClaimError {
  const say = (k: string) => t(k as never);
  if (!(error instanceof ApiError)) {
    return { message: say("guestErrRetry") };
  }
  const details = (error.details ?? {}) as Record<string, unknown>;
  const base = { code: error.code, requestId: error.requestId };
  switch (error.code) {
    case "PAYMENT_REFERENCE_ALREADY_USED":
      return {
        ...base,
        message: say("guestErrRefUsed"),
        fields: ["reference"],
      };
    case "PAYMENT_EXCEEDS_BALANCE": {
      const remaining =
        typeof details["remainingVes"] === "string" ? details["remainingVes"] : undefined;
      return {
        ...base,
        message: say("guestErrTooMuch").replace(
          "{amount}",
          `${remaining ? formatMinor(remaining) : "—"} Bs`,
        ),
        fields: ["amount"],
        ...(remaining ? { suggestVes: remaining } : {}),
      };
    }
    case "BILL_NOT_OPEN":
    case "OPEN_BILL_NOT_FOUND":
      return { ...base, message: say("c2pErrClosed") };
    case "VALIDATION_FAILED": {
      const raw = details["fields"];
      const fields = Array.isArray(raw) ? raw.map(String) : [];
      return { ...base, message: say("guestErrFields"), fields };
    }
    case "GUEST_SESSION_INVALID":
    case "GUEST_SESSION_MISSING":
      return {
        ...base,
        message: say("c2pErrSession"),
      };
    case "RATE_LIMITED":
      return { ...base, message: say("c2pErrTooMany") };
    default:
      return { ...base, message: say("guestErrRetry") };
  }
}

export function GuestPaymentPanel({
  bill,
  demo = false,
  splitParticipantId,
  shareRemainingVes,
  tipVes = "0",
}: {
  bill: Bill;
  demo?: boolean;
  /** Parte del reparto persistente que este comensal está pagando. */
  splitParticipantId?: string;
  /** Techo de esa parte: el backend rechaza cualquier cosa por encima. */
  shareRemainingVes?: string;
  /** Lo que el comensal eligió dejar de propina, en céntimos. */
  tipVes?: string;
}) {
  const { t } = useI18n();
  const payee: Payee | null =
    bill.payee ??
    (demo
      ? { bankCode: "0105", bankName: "Mercantil", phone: "04121234567", holderId: "J123456789" }
      : null);

  // Con reparto acordado, lo que toca pagar es la parte, no la cuenta entera.
  // Lo que hay que transferir es la cuenta más la propina, en un solo importe:
  // es lo que el comensal teclea en su app del banco. Sin sumarla, la pantalla
  // decía "Total a pagar 12.320,00" y justo debajo daba 11.200,00 para copiar,
  // y la propina no llegaba a cobrarse nunca.
  const billShareVes = shareRemainingVes ?? bill.remainingVes ?? "0";
  const dueVes = (BigInt(billShareVes) + BigInt(tipVes || "0")).toString();

  const [tab, setTab] = useState<"payee" | "claim" | "c2p">("payee");
  const [amount, setAmount] = useState(() => formatMinor(dueVes));
  // Si cambia la propina, cambia el importe sugerido -- salvo que el comensal
  // ya lo haya escrito él, que entonces manda lo suyo.
  const [amountTouched, setAmountTouched] = useState(false);
  useEffect(() => {
    if (!amountTouched) setAmount(formatMinor(dueVes));
  }, [dueVes, amountTouched]);
  const [reference, setReference] = useState("");
  const [phoneOrigin, setPhoneOrigin] = useState("");
  const [bankOrigin, setBankOrigin] = useState("");
  const [claim, setClaim] = useState<PaymentClaim | null>(null);
  const [error, setError] = useState<ClaimError | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const referenceRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const remaining = BigInt(dueVes);
  const billPaid = remaining === 0n;

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const mutation = useMutation({
    mutationFn: async (): Promise<PaymentClaim> => {
      const amountVes = parseMinorInput(amount) || "0";
      if (demo) {
        return {
          id: "demo-claim",
          amountVes,
          status: "PENDING",
          declaredReference: reference.trim(),
          createdAt: new Date().toISOString(),
        };
      }
      return guest.paymentClaim({
        amountVes: (BigInt(amountVes) - BigInt(tipVes || "0") > 0n
          ? BigInt(amountVes) - BigInt(tipVes || "0")
          : BigInt(amountVes)
        ).toString(),
        ...(BigInt(tipVes || "0") > 0n ? { tipVes } : {}),
        reference: reference.trim(),
        ...(phoneOrigin.trim() ? { phoneOrigin: phoneOrigin.trim() } : {}),
        ...(bankOrigin.trim() ? { bankOrigin: bankOrigin.trim() } : {}),
        ...(splitParticipantId ? { splitParticipantId } : {}),
      });
    },
    onSuccess: (data) => {
      setError(null);
      setClaim(data);
      setTimeout(() => successRef.current?.focus(), 0);
    },
    onError: (err) => {
      const parsed = toClaimError(err, t);
      setError(parsed);
      if (parsed.fields?.includes("reference")) referenceRef.current?.focus();
      if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        const secs = Number((err.details as { retryAfterSeconds?: unknown })?.retryAfterSeconds);
        setCooldown(Number.isFinite(secs) && secs > 0 ? Math.ceil(secs) : 30);
      }
    },
  });

  if (!payee) {
    return (
      <div className="surface mt-4 p-6">
        <p className="text-sm text-muted-foreground">
          Este restaurante todavía no tiene configurado el pago móvil. Pídele la cuenta al mesero.
        </p>
      </div>
    );
  }

  const amountMinor = parseMinorInput(amount) || "0";
  const referenceOk = /^[\d.\-\s]{4,32}$/.test(reference.trim());
  const sessionDead =
    error?.code === "GUEST_SESSION_INVALID" || error?.code === "GUEST_SESSION_MISSING";
  const billClosed = error?.code === "BILL_NOT_OPEN" || error?.code === "OPEN_BILL_NOT_FOUND";
  const canSubmit =
    !mutation.isPending &&
    cooldown === 0 &&
    !sessionDead &&
    !billClosed &&
    BigInt(amountMinor) > 0n &&
    referenceOk;

  const invalid = (name: string) => Boolean(error?.fields?.includes(name));

  const field =
    "mt-2 min-h-11 w-full rounded-lg border border-input bg-secondary px-3 text-base outline-none focus:border-ring aria-[invalid=true]:border-destructive";

  return (
    <div className="surface mt-4 p-6">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            // "Pagar con C2P" era la única de las tres que se partía en dos
            // líneas, así que la fila salía más alta por el centro. C2P es el
            // nombre del servicio del banco, igual que "Pago móvil": no hace
            // falta el verbo delante.
            { id: "payee", label: t("payTabMobile") },
            { id: "c2p", label: t("payTabC2P") },
            { id: "claim", label: t("payTabPaid") },
          ] as const
        ).map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            aria-pressed={tab === x.id}
            className={`min-h-11 rounded-lg border px-3 text-xs transition-colors ${
              tab === x.id
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "payee" && (
        <div className="mt-5">
          <p className="text-xs text-muted-foreground">
            Paga desde tu app del banco y luego confírmanos aquí.
          </p>
          <div className="mt-3 rounded-lg border border-border px-3">
            <CopyRow
              label={t("payoutBank")}
              display={`${payee.bankName} (${payee.bankCode})`}
              copyValue={payee.bankCode}
            />
            <CopyRow
              label={t("guestPhone")}
              display={formatPhone(payee.phone)}
              copyValue={payee.phone.replace(/\D/g, "")}
            />
            <CopyRow label="RIF/CI" display={payee.holderId} copyValue={payee.holderId} />
            <CopyRow
              lead
              label={splitParticipantId ? t("yourShare") : t("guestAmount")}
              display={formatMoney(dueVes, "VES")}
              copyValue={formatMinor(dueVes).replace(/\./g, "")}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{t("guestDirectNote")}</p>
        </div>
      )}

      {tab === "c2p" && (
        <>
          {/*
            El cargo C2P no admite propina: el contrato sólo tiene amountVes y
            el backend la cuenta contra el saldo. Prefijar share+propina hacía
            que el banco rechazara el pago por exceder lo pendiente. Se pasa
            sólo la parte de la cuenta y se avisa de que la propina va aparte.
          */}
          {BigInt(tipVes || "0") > 0n && (
            <p className="mt-4 rounded-lg border border-border bg-secondary/50 p-3 text-[11px] text-muted-foreground">
              El pago con tarjeta no incluye la propina de {formatMoney(tipVes, "VES")}; puedes
              dejarla aparte con pago móvil.
            </p>
          )}
          <GuestC2PForm maxVes={billShareVes} demo={demo} />
        </>
      )}

      {tab === "claim" && (
        <div className="mt-5">
          {billPaid ? (
            <div className="rounded-lg border border-primary/50 bg-primary/10 p-4">
              <p className="font-display text-2xl">{t("billSettledTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("guestNothingLeft")}</p>
            </div>
          ) : claim ? (
            <div
              ref={successRef}
              tabIndex={-1}
              role="status"
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 outline-none"
            >
              <p className="font-display text-2xl">{t("guestClaimSent")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("guestClaimSentBody")
                  .replace("{amount}", `${formatMinor(claim.amountVes)} Bs`)
                  .replace("{reference}", claim.declaredReference ?? "—")}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("guestClaimClosesOnConfirm")}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-amber-500/30 pt-3 text-xs text-muted-foreground">
                <span>{t("guestClaimStatus")}</span>
                <span className="rounded-full border border-amber-500/50 px-2 py-0.5 uppercase tracking-widest">
                  {claim.status === "PENDING" ? t("payToVerify") : claim.status}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("outstanding")}</span>
                <span className="figure">{formatMoney(bill.remainingVes ?? "0", "VES")}</span>
              </div>
            </div>
          ) : sessionDead ? (
            <p className="text-sm text-muted-foreground">{error?.message}</p>
          ) : billClosed ? (
            <p className="text-sm text-muted-foreground">{error?.message}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!canSubmit) return;
                mutation.mutate();
              }}
              noValidate
            >
              <div>
                <label
                  htmlFor="claim-amount"
                  className="text-xs uppercase tracking-widest text-muted-foreground"
                >
                  Monto pagado (Bs)
                </label>
                <input
                  id="claim-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmountTouched(true);
                    setAmount(e.target.value);
                  }}
                  aria-invalid={invalid("amount") || invalid("amountVes")}
                  aria-describedby="claim-amount-help"
                  className={field}
                />
                <p id="claim-amount-help" className="mt-1 text-[11px] text-muted-foreground">
                  Puedes pagar solo tu parte: cambia el monto si pagaste menos.
                </p>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="claim-reference"
                  className="text-xs uppercase tracking-widest text-muted-foreground"
                >
                  Referencia de tu pago
                </label>
                <input
                  id="claim-reference"
                  ref={referenceRef}
                  inputMode="numeric"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  aria-invalid={invalid("reference")}
                  aria-describedby="claim-reference-help"
                  className={field}
                />
                <p id="claim-reference-help" className="mt-1 text-[11px] text-muted-foreground">
                  El número que te dio tu banco al confirmar el pago móvil.
                </p>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="claim-phone"
                  className="text-xs uppercase tracking-widest text-muted-foreground"
                >
                  Teléfono desde el que pagaste (opcional)
                </label>
                <input
                  id="claim-phone"
                  inputMode="numeric"
                  value={phoneOrigin}
                  onChange={(e) => setPhoneOrigin(e.target.value)}
                  aria-invalid={invalid("phoneOrigin")}
                  aria-describedby="claim-phone-help"
                  className={field}
                />
                <p id="claim-phone-help" className="mt-1 text-[11px] text-muted-foreground">
                  Nos ayuda a encontrar tu pago más rápido.
                </p>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="claim-bank"
                  className="text-xs uppercase tracking-widest text-muted-foreground"
                >
                  Tu banco (opcional)
                </label>
                <input
                  id="claim-bank"
                  value={bankOrigin}
                  onChange={(e) => setBankOrigin(e.target.value)}
                  aria-invalid={invalid("bankOrigin")}
                  className={field}
                />
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-foreground">
                  <p>{error.message}</p>
                  {error.suggestVes && (
                    <button
                      type="button"
                      onClick={() => {
                        setAmount(formatMinor(error.suggestVes!));
                        setError(null);
                      }}
                      className="mt-2 rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary"
                    >
                      Usar ese monto
                    </button>
                  )}
                  {error.requestId && (
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      Referencia: {error.requestId}
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-5 min-h-12 w-full rounded-lg border border-primary bg-primary/15 px-4 text-sm text-foreground transition-colors disabled:opacity-40"
              >
                {mutation.isPending
                  ? t("loading")
                  : cooldown > 0
                    ? t("guestWaitSeconds").replace("{n}", String(cooldown))
                    : t("guestIPaid")}
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">{t("guestClaimNote")}</p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
