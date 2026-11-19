import { useI18n } from "@/lib/i18n";
import { formatMinor, formatMoney, type Payee } from "@/lib/api";
import type { usePaymentHold } from "@/lib/use-payment-hold";
import { clockTime } from "@/components/guest-pay/claim-error";
import { CopyRow } from "@/components/guest-pay/CopyRow";
import "@/lib/i18n-guest";

/** 04121234567 -> 0412-123.45.67 (sólo para leer; se copia en crudo). */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return raw;
  return `${d.slice(0, 4)}-${d.slice(4, 7)}.${d.slice(7, 9)}.${d.slice(9)}`;
}

/**
 * La pestaña «Pago móvil»: los datos para transferir, o el aviso de que otro
 * de la mesa está pagando lo que queda.
 */
export function PayeeTab({
  payee,
  demo,
  hold,
  retryHold,
  blockedByHold,
  blockedHeldVes,
  blockedUntil,
  splitParticipantId,
  dueVes,
  onGoToClaim,
}: {
  payee: Payee;
  demo: boolean;
  hold: ReturnType<typeof usePaymentHold>["state"];
  retryHold: () => void;
  blockedByHold: boolean;
  blockedHeldVes: string;
  blockedUntil: string | null;
  splitParticipantId: string | undefined;
  dueVes: string;
  onGoToClaim: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {/* Otro de la mesa está pagando todo lo que queda. Sin los datos para
        copiar: es justo lo que hay que evitar que se transfiera dos veces.
        Quien ya transfirió de todos modos sigue pudiendo avisar. */}
      {blockedByHold && (
        <div
          role="status"
          data-testid="guest-hold-blocked"
          className="mt-5 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
        >
          <p className="font-medium">
            {t("guestHoldBlockedTitle").replace("{amount}", formatMoney(blockedHeldVes, "VES"))}
          </p>
          <p className="mt-1 text-muted-foreground">
            {blockedUntil
              ? t("guestHoldBlockedUntil").replace("{time}", clockTime(blockedUntil))
              : t("guestHoldBlockedBody")}
          </p>
          <button
            type="button"
            data-testid="guest-hold-paid-anyway"
            onClick={onGoToClaim}
            className="mt-3 text-sm font-medium underline underline-offset-4"
          >
            {t("guestHoldPaidAnyway")}
          </button>
        </div>
      )}

      {!blockedByHold && (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground">
            Paga desde tu app del banco y luego confírmanos aquí.
          </p>
          {hold.kind === "held" && (
            <p data-testid="guest-hold-held" className="mt-2 text-xs text-muted-foreground">
              {hold.trimmed
                ? t("guestHoldTrimmed").replace("{amount}", formatMoney(hold.amountVes, "VES"))
                : t("guestHoldHeld").replace("{time}", clockTime(hold.expiresAt))}
            </p>
          )}
          {hold.kind === "expired" && (
            <p data-testid="guest-hold-expired" className="mt-2 text-xs text-muted-foreground">
              {t("guestHoldExpired")}{" "}
              <button
                type="button"
                onClick={retryHold}
                className="font-medium underline underline-offset-4"
              >
                {t("guestHoldRetry")}
              </button>
            </p>
          )}
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
          <p className="hint mt-3">{t("guestDirectNote")}</p>
          {/* La acción que lleva hacia delante en este paso. El comensal copia
            los datos, se va a su banco y vuelve: lo siguiente que tiene que
            hacer es decir que pagó, y eso vivía en una pestaña gris de 12 px
            con el mismo peso que la que ya estaba mirando. El paso entero
            no tenía un solo botón que llevara adelante. */}
          {!demo && (
            <button
              type="button"
              data-testid="guest-payee-done"
              onClick={onGoToClaim}
              className="btn-primary mt-5 w-full"
            >
              {t("payeeDone")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
