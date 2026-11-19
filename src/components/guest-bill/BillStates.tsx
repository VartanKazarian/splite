import { Suspense, lazy } from "react";
import { ArrowLeft } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { ApiError } from "@/lib/api";
import { GuestError } from "@/components/GuestError";
import { recallPayment } from "@/lib/guest-payment";
import "@/lib/i18n-guest";

/*
 * Las pantallas de la cuenta cuando todavía no hay cuenta que enseñar: sin
 * sesión, cargando, con error, o sin cuenta abierta (incluido «acabas de
 * pagar»). Ver `GuestBillScreen`.
 */

/*
 * Lo que sólo aparece después de pagar -- la factura, la opinión, el recibo --
 * se carga aparte y después: no hace falta para ver la cuenta, que es lo
 * primero que espera quien escanea el QR.
 */
const GuestInvoiceOffer = lazy(() =>
  import("@/components/GuestInvoiceOffer").then((m) => ({ default: m.GuestInvoiceOffer })),
);
const GuestRateMeal = lazy(() =>
  import("@/components/GuestRateMeal").then((m) => ({ default: m.GuestRateMeal })),
);
const GuestReceipt = lazy(() =>
  import("@/components/GuestReceipt").then((m) => ({ default: m.GuestReceipt })),
);

/**
 * Factura, «¿Qué tal todo?» y recibo, en este orden.
 *
 * Primero la acción que caduca -- pedir factura --, luego la opinión (R20) y
 * después el recibo, que es el registro y no se va a ninguna parte.
 */
export function AfterPaying() {
  return (
    <>
      <Suspense fallback={null}>
        <GuestInvoiceOffer />
      </Suspense>
      <Suspense fallback={null}>
        <GuestRateMeal />
      </Suspense>
      <Suspense fallback={null}>
        <GuestReceipt />
      </Suspense>
    </>
  );
}

export function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5">
      <header className="flex items-center justify-between py-5">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("backToTable")}
          </button>
        )}
      </header>
      <div className="surface p-6">{children}</div>
    </div>
  );
}

const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : undefined);

/** Sin sesión: un QR que no vale, una sesión caducada, o nada escaneado. */
export function SessionProblem({ error, onBack }: { error: unknown; onBack?: () => void }) {
  const { t } = useI18n();
  const code = codeOf(error);
  return (
    <Shell {...(onBack ? { onBack } : {})}>
      <h1 className="text-3xl">{t("yourBill")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {code === "QR_INVALID" || code === "QR_TOKEN_INVALID"
          ? t("qrInvalid")
          : code === "GUEST_SESSION_INVALID"
            ? t("sessionExpired")
            : t("scanNeeded")}
      </p>
      {error && !code ? <GuestError error={error} /> : null}
    </Shell>
  );
}

export function BillLoading({ onBack }: { onBack?: () => void }) {
  const { t } = useI18n();
  return (
    <Shell {...(onBack ? { onBack } : {})}>
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    </Shell>
  );
}

/** La cuenta no cargó. Con la sesión caducada, lo dice; si no, error y reintentar. */
export function BillLoadError({
  error,
  onRetry,
  onBack,
}: {
  error: unknown;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  if (codeOf(error) === "GUEST_SESSION_INVALID") {
    return (
      <Shell {...(onBack ? { onBack } : {})}>
        <h1 className="text-3xl">{t("yourBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("sessionExpired")}</p>
      </Shell>
    );
  }
  return (
    <Shell {...(onBack ? { onBack } : {})}>
      <h1 className="text-3xl">
        {error instanceof ApiError ? t("errorTitle") : t("errorOfflineTitle")}
      </h1>
      <GuestError error={error} onRetry={onRetry} />
    </Shell>
  );
}

/**
 * Sin cuenta abierta.
 *
 * Dos situaciones muy distintas caen aquí, y decirles lo mismo era
 * desconcertante.
 *
 * Quien escanea una mesa sin cuenta necesita saber precisamente eso. Pero
 * quien **acaba de pagar** también acaba aquí -- confirmar el cobro cierra
 * la cuenta -- y leer «Sin cuenta abierta» después de pagar parece que algo
 * salió mal. Si este teléfono declaró un pago, es la segunda.
 */
export function NoBill({
  demo,
  sessionEnded,
  noBillReason,
  rejoining,
  rejoinFailed,
  onRejoin,
  onBack,
}: {
  demo: boolean;
  sessionEnded: boolean;
  noBillReason: string | null;
  rejoining: boolean;
  rejoinFailed: boolean;
  onRejoin: () => void;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const justPaid = !demo && recallPayment() !== null;
  const ended = !demo && !justPaid && sessionEnded;
  return (
    <Shell {...(onBack ? { onBack } : {})}>
      <h1 className="text-3xl">
        {justPaid ? t("paidThanks") : ended ? t("sessionBillEndedTitle") : t("noOpenBill")}
      </h1>
      {ended && (
        <>
          <p data-testid="guest-session-ended" className="mt-3 text-sm text-muted-foreground">
            {t(
              noBillReason === "SESSION_PREDATES_BILL"
                ? "sessionPredatesBillBody"
                : "sessionBillEndedBody",
            )}
          </p>
          <button
            type="button"
            data-testid="guest-rejoin-table"
            onClick={onRejoin}
            disabled={rejoining}
            className="btn-primary mt-5 w-full"
          >
            {rejoining ? t("loading") : t("sessionRejoin")}
          </button>
          {rejoinFailed && (
            <p className="mt-3 text-sm text-muted-foreground">{t("sessionRejoinScan")}</p>
          )}
        </>
      )}
      {/* Qué pasa ahora, no cuál es la regla.
          Debajo de «Sin cuenta abierta» ponía «Una sola cuenta abierta por
          mesa», que es cierto y no le sirve de nada a quien acaba de escanear
          y no ve su cuenta: enuncia una restricción del sistema en vez de
          decir quién abre la cuenta y qué puede hacer mientras. Esa frase
          sigue donde sí ayuda -- en el panel, cuando alguien del local
          intenta abrir una segunda. */}
      {!ended && (
        <p className="mt-3 text-sm text-muted-foreground">
          {justPaid ? t("paidThanksBody") : t("noOpenBillBody")}
        </p>
      )}
      {/*
        Aquí cae justamente quien acaba de que le confirmen el pago: confirmar
        cierra la cuenta, y sin cuenta abierta esta pantalla es lo único que
        queda. Si la factura no se ofreciera aquí, la promesa de pedirla
        «cuando el restaurante confirme» no tendría dónde cumplirse.
      */}
      {!demo && <AfterPaying />}
    </Shell>
  );
}
