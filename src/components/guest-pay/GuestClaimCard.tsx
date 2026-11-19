import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { formatMinor, formatMoney, guest, type PaymentClaim } from "@/lib/api";
import { clockTime } from "@/components/guest-pay/claim-error";
import "@/lib/i18n-guest";

/**
 * Lo que pasó con el pago que este comensal declaró, al día.
 *
 * Antes la tarjeta decía «por verificar» desde la memoria del teléfono y ahí
 * se quedaba: si el personal lo confirmaba o lo rechazaba, el comensal no se
 * enteraba, y o preguntaba al mesero o -- peor -- pagaba otra vez. Ahora
 * pregunta al servidor cada pocos segundos mientras está por verificar, y se
 * para en cuanto alguien decide.
 *
 * El motivo de un rechazo no llega: es una nota interna del personal. Lo que
 * el comensal necesita saber es qué hacer, y eso sí se dice.
 */
export function GuestClaimCard({
  claim,
  demo,
  remainingVes,
  cardRef,
  onDeclareAgain,
}: {
  claim: PaymentClaim;
  demo?: boolean;
  remainingVes: string;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onDeclareAgain: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const followed = useQuery({
    // La misma clave que la oferta de factura: una sola pregunta para las dos.
    queryKey: ["guest-payment", claim.id],
    queryFn: () => guest.paymentStatus(claim.id),
    enabled: !demo,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === "PENDING" || status === "IN_DOUBT" || status === "AMBIGUOUS"
        ? 5000
        : false;
    },
  });
  const status = followed.data?.status ?? claim.status;
  const decidedAt = followed.data?.decidedAt ?? null;

  // Confirmado: el saldo de la cuenta cambió, y la pantalla de la cuenta lo
  // tiene que enseñar sin recargar.
  useEffect(() => {
    if (status === "SUCCEEDED") void queryClient.invalidateQueries({ queryKey: ["guest-bill"] });
  }, [status, queryClient]);

  const amount = `${formatMinor(claim.amountVes)} Bs`;
  const at = decidedAt ? clockTime(decidedAt) : null;

  if (status === "SUCCEEDED") {
    return (
      <div
        ref={cardRef}
        data-testid="guest-claim-confirmed"
        tabIndex={-1}
        role="status"
        className="rounded-lg border border-primary/50 bg-primary/10 p-4 outline-none"
      >
        <p className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Check aria-hidden className="h-5 w-5 text-primary" />
          {t("guestClaimConfirmed")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {(at
            ? t("guestClaimConfirmedAt").replace("{time}", at)
            : t("guestClaimConfirmedBody")
          ).replace("{amount}", amount)}
        </p>
      </div>
    );
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return (
      <div
        ref={cardRef}
        data-testid="guest-claim-rejected"
        tabIndex={-1}
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 outline-none"
      >
        <p className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <X aria-hidden className="h-5 w-5 text-destructive" />
          {t("guestClaimRejected")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("guestClaimRejectedBody")
            .replace("{amount}", amount)
            .replace("{reference}", claim.declaredReference ?? "—")}
        </p>
        <button
          type="button"
          onClick={onDeclareAgain}
          className="btn-choice mt-4 min-h-11 px-4 text-sm"
        >
          {t("guestClaimDeclareAgain")}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      data-testid="guest-claim-sent"
      tabIndex={-1}
      role="status"
      className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 outline-none"
    >
      {/* Sans y no serif: la serif es para los nombres -- el del
          restaurante, el de la mesa --, nunca para un rótulo de la
          interfaz. */}
      <p className="text-xl font-semibold tracking-tight">{t("guestClaimSent")}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("guestClaimSentBody")
          .replace("{amount}", amount)
          .replace("{reference}", claim.declaredReference ?? "—")}
      </p>
      <p className="hint mt-2">{t("guestClaimClosesOnConfirm")}</p>
      <div className="mt-3 flex items-center justify-between border-t border-amber-500/30 pt-3 text-xs text-muted-foreground">
        <span>{t("guestClaimStatus")}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 px-2 py-0.5 uppercase tracking-widest">
          <Clock aria-hidden className="h-3 w-3" />
          {t("guestClaimWaiting")}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("outstanding")}</span>
        <span className="figure">{formatMoney(remainingVes, "VES")}</span>
      </div>
    </div>
  );
}
