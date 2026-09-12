import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { guest, ApiError, type RequestInvoiceResult } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/**
 * «¿Necesitas factura?», al final y junto al recibo.
 *
 * El sitio es la mitad del diseño. Un formulario fiscal antes de pagar
 * convierte una cena en un trámite, y la mayoría de la gente no necesita
 * factura. Va después, cuando el dinero ya se movió y el comensal ya puede
 * levantarse de la mesa sin haber rellenado nada.
 *
 * **Consumidor final es el camino principal, no la excepción.** Por eso el
 * botón grande es «Sí, sin datos» y los campos están escondidos detrás del
 * segundo: pedir nombre, cédula y correo por defecto trataría al caso
 * mayoritario como un formulario a medio llenar.
 *
 * Y una regla que no se negocia: **un fallo aquí nunca se pinta como un pago
 * fallido**. El cobro ya está hecho. Lo que puede quedar pendiente es el
 * documento, y el texto lo dice con esas palabras.
 */
export function GuestInvoiceOffer({
  paymentId,
  paymentSettled,
}: {
  paymentId: string | null;
  /**
   * Si el cobro ya está confirmado. Un aviso de pago móvil queda pendiente de
   * que alguien lo verifique, y el backend no factura un cobro que aún no
   * entró -- produciría un documento que quizá haya que compensar mañana.
   */
  paymentSettled: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<RequestInvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!paymentId) throw new Error("missing payment");
      return guest.requestInvoice({
        paymentId,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(taxId.trim() ? { taxId: taxId.trim().toUpperCase() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
    },
    onSuccess: (data) => {
      setError(null);
      setResult(data);
    },
    onError: (err) => {
      // El único error que el comensal puede arreglar por su cuenta es el RIF.
      // Todo lo demás es del restaurante o del despliegue, y decirle «revisa
      // los datos» a alguien cuyos datos están bien no ayuda a nadie.
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const paths = (err.details as { fieldPaths?: string[] })?.fieldPaths ?? [];
        setError(paths.includes("taxId") ? t("invoiceTaxIdBad") : t("invoiceTaxIdBad"));
        return;
      }
      // Un 403 por plan o un 503 por falta de imprenta no son culpa suya ni
      // tienen remedio desde su teléfono: se trata como «en camino» en vez de
      // dejarle un error que no puede resolver.
      setResult({
        status: "UNCERTAIN",
        requestId: "",
        invoice: null,
        paymentUnaffected: true,
      });
    },
  });

  if (!paymentId || dismissed) return null;

  if (result?.status === "ISSUED" && result.invoice) {
    return (
      <div role="status" className="surface mt-4 border border-emerald-500/40 bg-emerald-500/5 p-5">
        <p className="font-display text-xl">{t("invoiceIssued")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("invoiceIssuedBody").replace("{control}", result.invoice.controlNumber)}
        </p>
      </div>
    );
  }

  if (result) {
    // En duda, o rechazada. No se ha creado ningún documento y puede que nunca
    // se cree -- pero el pago está hecho, y eso es lo primero que se lee.
    return (
      <div role="status" className="surface mt-4 border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="font-display text-xl">{t("invoicePending")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("invoicePendingBody")}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("invoicePaymentIntact")}</p>
      </div>
    );
  }

  return (
    <div className="surface mt-4 p-5">
      <p className="font-display text-xl">{t("invoiceAskTitle")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("invoiceAskBody")}</p>

      {!paymentSettled ? (
        // Sin cobro confirmado no hay nada que facturar todavía. Se dice, en
        // vez de ofrecer un botón que sólo puede fallar.
        <p className="mt-3 text-sm text-muted-foreground">{t("invoiceWaitForPayment")}</p>
      ) : !open ? (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t("invoiceFinalConsumer")}
          </button>
          <button
            type="button"
            className="min-h-[44px] w-full rounded-lg border border-border text-sm transition-colors hover:bg-muted"
            onClick={() => setOpen(true)}
          >
            {t("invoiceWithData")}
          </button>
          <button
            type="button"
            className="min-h-[44px] w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setDismissed(true)}
          >
            {t("invoiceCancel")}
          </button>
        </div>
      ) : (
        <form
          className="mt-4 flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!mutation.isPending) mutation.mutate();
          }}
        >
          <label className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("invoiceName")}
            <input
              className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-transparent px-3 text-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("invoiceTaxId")}
            <input
              className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-transparent px-3 text-base"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="V12345678"
              // En mayúsculas al escribir: el backend exige el prefijo así, y
              // corregirlo por el comensal es más barato que rechazarlo.
              style={{ textTransform: "uppercase" }}
            />
          </label>
          <label className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("invoiceEmail")}
            <input
              className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-transparent px-3 text-base"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <button
            type="submit"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={mutation.isPending}
          >
            {t("invoiceSend")}
          </button>

          {/*
            La vuelta atrás. Sin ella, abrir el formulario dejaba encerrado a
            quien sólo quería la factura sin datos: los dos botones del caso
            mayoritario desaparecían y no había forma de volver sin recargar.
          */}
          <button
            type="button"
            className="min-h-[44px] w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setOpen(false)}
          >
            {t("invoiceBack")}
          </button>
        </form>
      )}
    </div>
  );
}
