import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { guest, ApiError } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useRememberedPayment } from "@/lib/guest-payment";

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
export function GuestInvoiceOffer() {
  const { t } = useI18n();
  /*
   * El pago sale de `sessionStorage` y su estado del servidor, no de lo que le
   * pasen por props.
   *
   * Antes venía del panel de pago, y eso lo ataba a dos cosas que desaparecen
   * justo cuando la factura empieza a poder pedirse: el panel se desmonta
   * cuando la cuenta no debe nada, y la pantalla entera deja de cargar cuando
   * la cuenta se cierra. La promesa «podrás pedirla cuando confirmen» era
   * incumplible por construcción.
   */
  const paymentId = useRememberedPayment();

  const payment = useQuery({
    queryKey: ["guest-payment", paymentId],
    queryFn: () => guest.paymentStatus(paymentId as string),
    enabled: Boolean(paymentId),
    // Mientras el cobro esté por verificar se vuelve a preguntar solo: quien
    // está en la mesa esperando no debería tener que recargar para enterarse.
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== "PENDING" ? false : 8000,
    retry: false,
  });

  const settled = payment.data?.status === "SUCCEEDED";
  const alreadyInvoiced = payment.data?.invoiced === true;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  /**
   * El consentimiento comercial, **sin marcar** y aparte.
   *
   * Dar el correo para que llegue la factura y aceptar publicidad son dos
   * finalidades distintas. Marcarla por defecto -- o deducirla de que haya
   * escrito un correo -- convertiría un dato transaccional en una lista de
   * promociones sin que nadie dijera que sí, que es justo lo que se impugna
   * después.
   */
  const [marketing, setMarketing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!paymentId) throw new Error("missing payment");
      // El contacto se guarda aparte de la factura, a propósito: son dos
      // finalidades y el backend las guarda como dos cosas. Si esto falla no
      // se arrastra la factura -- el documento importa más que la lista.
      if (email.trim()) {
        void guest
          .saveContact({
            email: email.trim(),
            ...(name.trim() ? { name: name.trim() } : {}),
            marketingConsent: marketing,
          })
          .catch(() => undefined);
      }

      return guest.requestInvoice({
        paymentId,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(taxId.trim() ? { taxId: taxId.trim().toUpperCase() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
    },
    onSuccess: (data) => {
      setError(null);
      // ISSUED trae documento. UNCERTAIN es el único «en camino» de verdad.
      // Un FAILED es un rechazo de la imprenta: no hay nada en ninguna cola.
      if (data.status === "ISSUED" && data.invoice) {
        setOutcome({ kind: "issued", controlNumber: data.invoice.controlNumber });
      } else if (data.status === "UNCERTAIN") {
        setOutcome({ kind: "pending" });
      } else {
        setOutcome({ kind: "rejected" });
      }
    },
    onError: (err) => {
      // El único error que el comensal puede arreglar por su cuenta es el RIF.
      // Todo lo demás es del restaurante o del despliegue, y decirle «revisa
      // los datos» a alguien cuyos datos están bien no ayuda a nadie.
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        setError(t("invoiceTaxIdBad"));
        return;
      }
      setOutcome(outcomeForError(err));
    },
  });

  // Sin pago recordado no hay nada que ofrecer. Y si ya tiene factura tampoco:
  // ofrecerla otra vez invitaría a pedir un segundo documento del mismo cobro.
  if (!paymentId || dismissed || alreadyInvoiced) return null;
  // Hasta saber en qué quedó, no se promete nada.
  if (payment.isPending || payment.isError) return null;

  if (outcome?.kind === "issued") {
    return (
      <div role="status" className="surface mt-4 border border-emerald-500/40 bg-emerald-500/5 p-5">
        <p className="font-display text-xl">{t("invoiceIssued")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("invoiceIssuedBody").replace("{control}", outcome.controlNumber)}
        </p>
      </div>
    );
  }

  if (outcome) {
    const copy = COPY[outcome.kind];
    return (
      <div role="status" className="surface mt-4 border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="font-display text-xl">{t(copy.title)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t(copy.body)}</p>
        {/* Lo primero que hay que despejar, pase lo que pase con el documento. */}
        <p className="mt-2 text-[11px] text-muted-foreground">{t("invoicePaymentIntact")}</p>
        {/*
          Reintentar sólo donde de verdad puede haber cambiado algo: una red que
          se cortó. Si la petición sí llegó, el segundo intento contesta 409 y
          cae en «ya pediste tu factura», que también es cierto -- nunca en un
          segundo documento, que el índice único del servidor impide.
        */}
        {copy.retry ? (
          <button
            type="button"
            className="mt-4 min-h-[44px] w-full rounded-lg border border-border text-sm transition-colors hover:bg-muted disabled:opacity-40"
            disabled={mutation.isPending}
            onClick={() => {
              setOutcome(null);
              mutation.mutate();
            }}
          >
            {t("invoiceRetry")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="surface mt-4 p-5">
      <p className="font-display text-xl">{t("invoiceAskTitle")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("invoiceAskBody")}</p>

      {!settled ? (
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

          {/*
            La casilla va debajo del correo y con su propia explicación, no
            pegada al campo: quien la lea tiene que poder ver que es otra cosa
            distinta de recibir su factura. Y empieza vacía.
          */}
          {email.trim() ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-sm">
                {t("marketingOptIn")}
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {t("marketingWhy")}
                </span>
              </span>
            </label>
          ) : null}

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

/**
 * En qué quedó la petición, con nombre propio.
 *
 * Existe porque antes **todo** error no-validación se pintaba como «tu factura
 * está en camino, el restaurante la está resolviendo». Para la mayoría de los
 * casos eso era falso de las tres maneras a la vez: no se creó ninguna
 * petición, no hay nada en ninguna cola, y nadie va a resolver nada. El más
 * común en producción era precisamente ése -- un 503 porque el despliegue no
 * tiene imprenta configurada.
 *
 * `pending` es el único que promete algo, y sólo lo produce un 202 con
 * `UNCERTAIN`: ahí sí existe una petición y sí la mira una persona.
 */
type Outcome =
  | { kind: "issued"; controlNumber: string }
  | { kind: "pending" }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "already" }
  | { kind: "declared" }
  | { kind: "tooEarly" }
  | { kind: "failed" };

const COPY: Record<
  Exclude<Outcome["kind"], "issued">,
  { title: Key; body: Key; retry?: boolean }
> = {
  pending: { title: "invoicePending", body: "invoicePendingBody" },
  rejected: { title: "invoiceRejected", body: "invoiceRejectedBody" },
  unavailable: { title: "invoiceUnavailable", body: "invoiceUnavailableBody" },
  already: { title: "invoiceAlready", body: "invoiceAlreadyBody" },
  declared: { title: "invoiceDeclared", body: "invoiceDeclaredBody" },
  tooEarly: { title: "invoiceTooEarly", body: "invoiceTooEarlyBody" },
  failed: { title: "invoiceFailed", body: "invoiceFailedBody", retry: true },
};

function outcomeForError(err: unknown): Outcome {
  if (!(err instanceof ApiError)) return { kind: "failed" };
  switch (err.code) {
    // Las dos razones por las que este restaurante no factura desde aquí. Se
    // cuentan igual a propósito: cuál de las dos es -- un plan o una imprenta
    // sin configurar -- no es asunto del comensal, y lo accionable para él es
    // el mismo en ambos casos.
    case "FISCAL_PROVIDER_NOT_CONFIGURED":
    case "PLAN_UPGRADE_REQUIRED":
      return { kind: "unavailable" };
    case "FISCAL_ALREADY_REQUESTED":
      return { kind: "already" };
    case "FISCAL_NOTHING_TO_DECLARE":
      return { kind: "declared" };
    case "PAYMENT_STATE_INVALID":
      return { kind: "tooEarly" };
    default:
      return { kind: "failed" };
  }
}
