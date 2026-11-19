import { Suspense, lazy, useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { usePaymentHold } from "@/lib/use-payment-hold";
import { formatMoney, type Bill, type PaymentClaim, type Payee } from "@/lib/api";
import { ClaimTab } from "@/components/guest-pay/ClaimTab";
import { PayeeTab } from "@/components/guest-pay/PayeeTab";
import { useClaimForm } from "@/components/guest-pay/useClaimForm";
import "@/lib/i18n-guest";

/** El cobro C2P se carga al elegirlo: la mayoría paga por Pago Móvil. */
const GuestC2PForm = lazy(() =>
  import("@/components/GuestC2PForm").then((m) => ({ default: m.GuestC2PForm })),
);

/**
 * El paso 3, cómo pagas: Pago móvil (los datos para transferir), C2P (el cobro
 * directo a tu banco) o «Ya pagué» (el aviso para que el personal lo
 * verifique). Las pestañas viven en `components/guest-pay/`.
 */
export function GuestPaymentPanel({
  bill,
  demo = false,
  splitParticipantId,
  shareRemainingVes,
  shareAvailableVes,
  tipVes = "0",
  onClaimSent,
}: {
  bill: Bill;
  demo?: boolean;
  /** Parte del reparto persistente que este comensal está pagando. */
  splitParticipantId?: string;
  /** Techo de esa parte: el backend rechaza cualquier cosa por encima. */
  shareRemainingVes?: string;
  /** Lo que queda de esa parte descontando lo ya avisado por otros. */
  shareAvailableVes?: string;
  /** Lo que el comensal eligió dejar de propina, en céntimos. */
  tipVes?: string;
  /** Avisa a la pantalla de que el aviso salió: ya no hay paso al que volver. */
  onClaimSent?: () => void;
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
  // Sin parte elegida, lo que queda por transferir es lo que deja libre lo ya
  // avisado por otros de la mesa (`availableVes`): sugerir el saldo entero
  // invitaba a pagar dos veces lo que alguien acababa de mandar.
  const billShareVes =
    shareAvailableVes ?? shareRemainingVes ?? bill.availableVes ?? bill.remainingVes ?? "0";
  const pendingAtTable = BigInt(bill.pendingVes ?? "0");
  // Lo que dice el libro, sin descontar avisos: sólo esto puede decir «pagada».
  const ledgerShareVes = shareRemainingVes ?? bill.remainingVes ?? "0";
  // Pagada es pagada según el libro. Que otros hayan avisado por todo lo que
  // queda no la paga: hasta que el restaurante lo verifique, puede que no.
  const billPaid = BigInt(ledgerShareVes) === 0n;

  const [claim, setClaim] = useState<PaymentClaim | null>(null);

  // «Voy a pagar esto», antes de que el comensal vaya a su banco: el resto de
  // la mesa ve esta parte como «alguien está pagando» y no la puede tomar.
  // Después de avisar ya no: el aviso es lo que cuenta.
  const { state: hold, retry: retryHold } = usePaymentHold({
    amountVes: billShareVes,
    splitParticipantId,
    enabled: !demo && !billPaid && !claim,
    tableState: `${bill.heldVes ?? ""}|${bill.pendingVes ?? ""}|${bill.amountPaidVes}`,
  });
  // Si otro estaba pagando parte, lo que toca es lo que quedó libre.
  const payShareVes = hold.kind === "held" && hold.trimmed ? hold.amountVes : billShareVes;
  // Bloqueado por otro que está pagando: o la reserva se rechazó, o la cuenta
  // ya llega diciendo que lo que queda lo tiene otro (entonces ni se pide: el
  // importe a reservar es cero). La cuenta se relee cada pocos segundos, así
  // que si el otro vuelve atrás o vence, esto se libera solo.
  const heldAtTable = BigInt(bill.heldVes ?? "0");
  const blockedByHold =
    !billPaid &&
    !claim &&
    ((hold.kind === "blocked" && BigInt(hold.heldVes) > 0n) ||
      (BigInt(billShareVes) === 0n && heldAtTable > 0n));
  const blockedHeldVes = hold.kind === "blocked" ? hold.heldVes : heldAtTable.toString();
  const blockedUntil = hold.kind === "blocked" ? hold.heldUntil : (bill.heldUntil ?? null);
  const dueVes = (BigInt(payShareVes) + BigInt(tipVes || "0")).toString();

  const [tab, setTab] = useState<"payee" | "claim" | "c2p">("payee");
  const form = useClaimForm({
    bill,
    demo,
    tipVes,
    dueVes,
    payShareVes,
    splitParticipantId,
    setClaim,
    onClaimSent,
  });
  /*
   * Si C2P puede funcionar aquí.
   *
   * La pestaña se ofrecía siempre, y en un restaurante sin el raíl configurado
   * no lleva a ninguna parte: el comensal rellena el formulario, se va a su
   * banco a por una clave de un solo uso y el cargo se rechaza al final. Es el
   * peor sitio posible donde enterarse.
   *
   * Lo dice el servidor, que es el único que lo sabe. El primer intento fue
   * deducirlo aquí, cruzando el banco de cobro con `chargeable` de la lista de
   * bancos, y era falso: esa bandera dice qué módulo de integración está mapeado
   * a un código de banco, hoy **ninguno**, así que habría escondido la pestaña
   * en todos los restaurantes, incluidos los que sí pueden cobrar.
   *
   * Sin el campo -- una API vieja -- se ofrece, que es como estaba.
   */
  const c2pPossible = bill.c2pAvailable !== false;

  // Si estaba abierta y deja de poder estarlo, no se queda seleccionada una
  // pestaña que ya no se dibuja.
  useEffect(() => {
    if (!c2pPossible && tab === "c2p") setTab("payee");
  }, [c2pPossible, tab]);

  const coveredByPending = !billPaid && BigInt(billShareVes) === 0n && pendingAtTable > 0n;

  if (!payee) {
    return (
      <div className="surface mt-4 p-6">
        <p className="text-sm text-muted-foreground">{t("payeeMissing")}</p>
      </div>
    );
  }

  return (
    <div className="surface mt-4 p-6">
      {/* "Pagar con C2P" era la única de las tres que se partía en dos líneas,
          así que la fila salía más alta por el centro. C2P es el nombre del
          servicio del banco, igual que "Pago móvil": no hace falta el verbo
          delante. */}
      <div className={`grid gap-2 ${c2pPossible ? "grid-cols-3" : "grid-cols-2"}`}>
        {[
          { id: "payee" as const, label: t("payTabMobile") },
          ...(c2pPossible ? [{ id: "c2p" as const, label: t("payTabC2P") }] : []),
          { id: "claim" as const, label: t("payTabPaid") },
        ].map((x) => (
          <button
            key={x.id}
            type="button"
            data-testid={`guest-pay-tab-${x.id}`}
            onClick={() => setTab(x.id)}
            aria-pressed={tab === x.id}
            className={`min-h-11 rounded-lg border-[1.5px] px-3 text-sm font-medium text-foreground transition-colors ${
              tab === x.id
                ? "border-primary bg-primary/10"
                : "border-border-strong bg-card hover:bg-secondary"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* Lo que otros de la mesa ya avisaron, encima de las pestañas y no
          dentro de una: el momento que importa es antes de copiar el importe
          e ir al banco, que es la pestaña «Pago móvil», y después ya sólo
          queda avisar. Visto sólo en «Ya pagué» llegaba tarde. */}
      {!billPaid && !claim && pendingAtTable > 0n && (
        <div
          role="status"
          data-testid="guest-pending-notice"
          className="mt-5 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          <p className="font-medium">
            {t(coveredByPending ? "guestPendingCoversTitle" : "guestPendingSomeTitle").replace(
              "{amount}",
              formatMoney(pendingAtTable.toString(), "VES"),
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(coveredByPending ? "guestPendingCoversBody" : "guestPendingSomeBody")}
          </p>
        </div>
      )}

      {tab === "payee" && (
        <PayeeTab
          payee={payee}
          demo={demo}
          hold={hold}
          retryHold={retryHold}
          blockedByHold={blockedByHold}
          blockedHeldVes={blockedHeldVes}
          blockedUntil={blockedUntil}
          splitParticipantId={splitParticipantId}
          dueVes={dueVes}
          onGoToClaim={() => setTab("claim")}
        />
      )}

      {tab === "c2p" && (
        /*
          La propina va dentro del cargo, no aparte.
          `maxVes` es el techo de lo que puede ir contra la cuenta -- la parte
          sin propina, que es lo que el saldo admite -- y `tipVes` viaja al
          lado: el banco cobra la suma de los dos. Lo que el formulario enseña
          y pide es esa suma, que es la cifra por la que el comensal tiene que
          pedirle la clave a su banco; el reparto en dos lo hace él antes de
          llamar a la API.
        */
        <Suspense fallback={null}>
          <GuestC2PForm maxVes={ledgerShareVes} tipVes={tipVes} demo={demo} />
        </Suspense>
      )}

      {tab === "claim" && (
        <ClaimTab
          form={form}
          bill={bill}
          demo={demo}
          billPaid={billPaid}
          claim={claim}
          onDeclareAgain={() => setClaim(null)}
        />
      )}
    </div>
  );
}
