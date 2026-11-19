import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useI18n } from "@/lib/i18n";
import { rememberPayment, rememberPayerEmail } from "@/lib/guest-payment";
import { apportionTransfer } from "@/lib/transfer";
import {
  ApiError,
  formatMinor,
  guest,
  parseMinorInput,
  type Bill,
  type PaymentClaim,
} from "@/lib/api";
import { toClaimError, type ClaimError } from "@/components/guest-pay/claim-error";
import "@/lib/i18n-guest";

/**
 * El aviso «Ya pagué»: lo escrito, el envío y sus errores.
 *
 * Un hook y no el propio formulario a propósito: lo llama `GuestPaymentPanel`,
 * así que lo escrito sobrevive a cambiar de pestaña -- quien va a «Pago móvil»
 * a copiar el importe y vuelve no encuentra el formulario en blanco.
 */
export function useClaimForm({
  bill,
  demo,
  tipVes,
  dueVes,
  payShareVes,
  splitParticipantId,
  setClaim,
  onClaimSent,
}: {
  bill: Bill;
  demo: boolean;
  tipVes: string;
  /** Lo que hay que transferir: la parte más la propina. */
  dueVes: string;
  /** La parte sin propina, para separar después cuánto es cuenta y cuánto propina. */
  payShareVes: string;
  splitParticipantId: string | undefined;
  setClaim: (claim: PaymentClaim) => void;
  onClaimSent: (() => void) | undefined;
}) {
  const { t } = useI18n();
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
  /*
   * Los bancos, para elegir en vez de escribir.
   *
   * `bankOrigin` es opcional pero cerrado: el servidor sólo admite un código de
   * su lista. Con una caja de texto, escribir «Banesco» -- lo que cualquiera
   * escribe -- devolvía 400 y dejaba al comensal sin poder pagar la cuenta, por
   * un campo que no tenía obligación de rellenar. El mensaje de error decía ya
   * «elígelo de la lista» y esa lista no estaba en ninguna pantalla.
   *
   * Si la petición falla no se rompe nada: el campo se queda sin opciones y el
   * comensal paga sin banco, que es un envío perfectamente válido. Corroborar
   * es una ayuda, no un requisito, y no puede costar el pago.
   */
  const banks = useQuery({
    queryKey: ["guest-banks"],
    queryFn: () => guest.banks(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const [error, setError] = useState<ClaimError | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const referenceRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /*
   * El correo, y el permiso para escribirle: dos cosas, no una.
   *
   * Hasta aquí sólo se pedía dentro de la oferta de factura, que aparece
   * después de pagar y sólo si el restaurante puede emitir -- plan, proveedor,
   * RIF y serie. Sin serie configurada no se recogía ninguno, nunca, y el
   * comensal que quería su comprobante no tenía dónde dejarlo.
   *
   * Va como opcional de verdad: se puede pagar sin escribirlo, y si se deja
   * vacío no se manda nada. Y el consentimiento comercial nace **sin marcar**
   * y aparte del campo, porque dar un correo para un recibo no es aceptar que
   * te escriban después; juntarlos sería obtener lo segundo aprovechando lo
   * primero.
   */
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  /*
   * «Envíame la factura», aquí y no sólo después.
   *
   * La factura se puede emitir cuando el restaurante confirma el cobro, y eso
   * pasa minutos después, a menudo con el comensal ya fuera. Pedirla sólo
   * entonces obligaba a quedarse mirando la pantalla. Marcada aquí, sale sola
   * al confirmar y llega al correo de arriba.
   *
   * Sin marcar por defecto: una factura fiscal gasta un número de la serie del
   * restaurante y es un documento que éste declara. No se emite porque alguien
   * haya escrito su correo, sino porque la pidió.
   */
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [inName, setInName] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceTaxId, setInvoiceTaxId] = useState("");
  const canInvoice = bill.canRequestInvoice === true && !demo;
  const invoiceWanted = canInvoice && wantsInvoice && Boolean(email.trim());

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
      // Lo escrito es lo transferido; de ahí sale cuánto es cuenta y cuánto
      // propina, y las dos cifras suman siempre lo que salió del banco.
      const parts = apportionTransfer({
        transferredVes: amountVes,
        tipVes,
        shareVes: payShareVes,
      });
      return guest.paymentClaim({
        amountVes: parts.amountVes,
        ...(BigInt(parts.tipVes) > 0n ? { tipVes: parts.tipVes } : {}),
        reference: reference.trim(),
        ...(phoneOrigin.trim() ? { phoneOrigin: phoneOrigin.trim() } : {}),
        ...(bankOrigin.trim() ? { bankOrigin: bankOrigin.trim() } : {}),
        ...(splitParticipantId ? { splitParticipantId } : {}),
        ...(invoiceWanted
          ? {
              invoice: {
                email: email.trim(),
                ...(inName && invoiceName.trim() ? { name: invoiceName.trim() } : {}),
                // Sin guiones ni espacios: así se escribe en el papel del RIF
                // («J-12345678-9») y así lo rechazaba el servidor, que espera
                // la letra y los dígitos seguidos.
                ...(inName && invoiceTaxId.trim()
                  ? { taxId: invoiceTaxId.toUpperCase().replace(/[^A-Z0-9]/g, "") }
                  : {}),
              },
            }
          : {}),
      });
    },
    onSuccess: (data) => {
      setError(null);
      setClaim(data);
      onClaimSent?.();
      // Aparte del cobro y sin bloquearlo: el pago del comensal importa más
      // que nuestra lista, así que si esto falla no se entera ni lo nota.
      if (!demo && email.trim()) {
        void guest
          .saveContact({ email: email.trim(), marketingConsent: marketing })
          .catch(() => undefined);
      }
      // El único hilo que le queda al comensal con su propio pago cuando la
      // cuenta se cierre y esta pantalla desaparezca.
      rememberPayment(data.id);
      if (email.trim()) rememberPayerEmail(email.trim());
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

  return {
    amount,
    setAmount,
    setAmountTouched,
    reference,
    setReference,
    phoneOrigin,
    setPhoneOrigin,
    bankOrigin,
    setBankOrigin,
    banks,
    email,
    setEmail,
    marketing,
    setMarketing,
    wantsInvoice,
    setWantsInvoice,
    inName,
    setInName,
    invoiceName,
    setInvoiceName,
    invoiceTaxId,
    setInvoiceTaxId,
    canInvoice,
    error,
    setError,
    cooldown,
    referenceRef,
    successRef,
    mutation,
    sessionDead,
    billClosed,
    canSubmit,
    invalid,
  };
}

export type ClaimFormState = ReturnType<typeof useClaimForm>;
