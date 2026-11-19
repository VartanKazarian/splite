import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  guest,
  guestSession,
  parseMinorInput,
  scannedQr,
  type Bill,
  type BillSplit,
  type SplitMode,
  type SplitPreview,
} from "@/lib/api";

import { GuestPaymentPanel } from "@/components/GuestPaymentPanel";
import { GuestSplitProgress } from "@/components/GuestSplitProgress";
import { GuestStepIndicator } from "@/components/GuestStepIndicator";
import {
  AfterPaying,
  BillLoadError,
  BillLoading,
  NoBill,
  SessionProblem,
} from "@/components/guest-bill/BillStates";
import { BillSummary, NothingToPay } from "@/components/guest-bill/BillSummary";
import { buildSplitBody, myShare, scrollFrameTo } from "@/components/guest-bill/helpers";
import { useBillAutoplay, useGuestBillSession, usePayStep } from "@/components/guest-bill/hooks";
import { PayDock } from "@/components/guest-bill/PayDock";
import { SplitPanel } from "@/components/guest-bill/SplitPanel";
import { demoBill, demoSplit } from "@/lib/demo-bill";
import "@/lib/i18n-guest";

/**
 * La cuenta del comensal, de escanear a pagar.
 *
 * Aquí vive el estado -- la sesión, la cuenta, el reparto, la propina, el paso
 * -- y cómo se reparte entre las piezas de `components/guest-bill/`, que sólo
 * pintan: el resumen de la cuenta, el panel del reparto, la barra de abajo y
 * las pantallas sin cuenta. El pago es `GuestPaymentPanel`.
 */
export function GuestBillScreen({
  qr,
  demo = false,
  embedded = false,
  autoplay = false,
  onBack,
}: {
  qr?: string;
  demo?: boolean;
  /**
   * Esta pantalla va dentro de otra cosa -- el marco de teléfono de la landing --
   * y no ocupando la ventana.
   *
   * Lo único que cambia es el `min-h-screen` del contenedor: dentro de un marco
   * de 640 px de alto, estirarse a la altura de la ventana deja medio kilómetro
   * de vacío por debajo de la cuenta. Nada más se toca, y ésa es la idea: la
   * demo de la landing tiene que ser **esta** pantalla y no una copia suya, o
   * en tres meses enseñará un producto que ya no existe.
   */
  embedded?: boolean;
  /**
   * Reproducir sola una parte de la cuenta, como un vídeo.
   *
   * Sólo en la landing, y sólo con `demo`. Quien mira la página de venta no
   * llega con ganas de trastear: llega a ver si esto le sirve, y una demo que
   * exige descubrir dónde se toca se queda sin tocar. Esto le enseña lo que
   * hace en seis segundos y **le deja el volante en cuanto roza la pantalla**,
   * que es lo que un vídeo no puede hacer.
   */
  autoplay?: boolean;
  /**
   * Vuelve a la pantalla de la mesa.
   *
   * Antes esta cabecera era un `<Link to="/">`: desde la cuenta, "atrás" sacaba
   * al comensal del restaurante y lo dejaba en la página de Splite, sin forma
   * de volver a la carta salvo escaneando otra vez el código de la mesa.
   */
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const { sessionReady, sessionError } = useGuestBillSession({ qr, demo });
  // Con el aviso enviado no queda paso al que volver: «Volver a la propina»
  // debajo de «Aviso enviado» invitaba a cambiar una propina ya declarada.
  const [claimSent, setClaimSent] = useState(false);

  /*
   * Por qué no hay cuenta, cuando no la hay. La sesión es de una cuenta, no de
   * la mesa: cuando esa cuenta se cierra, este teléfono ya no ve la siguiente
   * de la mesa aunque la haya (`SESSION_BILL_ENDED`), y una sesión abierta en
   * una mesa vacía hace mucho no se engancha a la cuenta nueva de otros
   * (`SESSION_PREDATES_BILL`). En los dos casos lo que hace falta es una
   * sesión nueva, y la pantalla tiene que decirlo en vez de «sin cuenta».
   */
  const [noBillReason, setNoBillReason] = useState<string | null>(null);
  const sessionEnded =
    noBillReason === "SESSION_BILL_ENDED" || noBillReason === "SESSION_PREDATES_BILL";
  const [rejoining, setRejoining] = useState(false);
  const [rejoinFailed, setRejoinFailed] = useState(false);

  const billQuery = useQuery({
    queryKey: ["guest-bill", demo],
    enabled: sessionReady && !demo,
    retry: false,
    // El personal añade productos mientras la gente está sentada. Cada diez
    // segundos: con cinco, una mesa de seis en el wifi del local eran setenta
    // peticiones por minuto sólo para esto, y un plato nuevo no se nota por
    // aparecer cinco segundos antes.
    refetchInterval: 10000,
    queryFn: async (): Promise<Bill | null> => {
      try {
        const found = await guest.bill<Bill>();
        setNoBillReason(null);
        return found;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          const reason = (error.details as { reason?: unknown }).reason;
          setNoBillReason(typeof reason === "string" ? reason : null);
          return null;
        }
        throw error;
      }
    },
  });

  /**
   * Una sesión nueva con el QR que este teléfono escaneó, para la cuenta que
   * tiene la mesa ahora. Es lo mismo que volver a escanear.
   */
  const rejoinTable = async () => {
    const token = scannedQr.get();
    if (!token) {
      setRejoinFailed(true);
      return;
    }
    setRejoining(true);
    setRejoinFailed(false);
    try {
      guestSession.set(null);
      await guest.openSession(token);
      setNoBillReason(null);
      await billQuery.refetch();
    } catch {
      setRejoinFailed(true);
    } finally {
      setRejoining(false);
    }
  };

  const [mode, setMode] = useState<SplitMode>("FULL");
  const [diners, setDiners] = useState(2);
  /**
   * Cómo te llamas, para que la mesa sepa quién ha pagado.
   *
   * Opcional a propósito y sin pedirlo dos veces: sin nombre la lista dice
   * «Comensal 2», que funciona. El valor de ponerlo es para los demás -- ver
   * quién falta sin preguntar en voz alta -- así que el campo es una línea y no
   * un paso.
   */
  const [myName, setMyName] = useState("");
  // itemId -> unidades que paga este comensal
  const [mine, setMine] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  // Propina opcional del comensal, encima del cargo por servicio de la cuenta.
  // Preseleccionada al 10%. Es lo que hacen Sunday, Toast y Square, y es de
  // lejos lo que más mueve lo que acaba cobrando el personal. Se mantiene
  // honesta porque el importe está siempre a la vista y "Sin propina" es el
  // primer botón de la fila: un toque, sin buscarlo y sin explicaciones.
  const [tipPct, setTipPct] = useState<number | null>(10);
  const [tipCustom, setTipCustom] = useState("");
  /** Si el comensal ha abierto las formas de dividir. Cerrado = pagarlo todo. */
  const [splitOpen, setSplitOpen] = useState(false);

  const [step, setStep] = usePayStep(demo);

  const demoBillData = useMemo(() => (demo ? demoBill() : null), [demo]);
  const bill = demo ? demoBillData : (billQuery.data ?? null);
  const rateStr = bill?.fxRateVesPerUnit ?? bill?.fxRate ?? null;
  const showVes = Boolean(bill && bill.currency !== "VES" && rateStr);

  const splitBody = () => buildSplitBody({ bill, mode, diners, myName, mine, amount });

  const splitMutation = useMutation({
    mutationFn: async () => {
      if (demo && bill) {
        return demoSplit(bill, mode, {
          diners,
          mine,
          amountMinor: parseMinorInput(amount) || "0",
        });
      }
      // El reparto lo calcula el servidor: nunca se divide en el cliente.
      return guest.splitPreview<SplitPreview>(splitBody());
    },
    onSuccess: setPreview,
    onError: () => setPreview(null),
  });

  /** La referencia de participante que le corresponde a quien está mirando. */
  const myRef = mode === "EQUAL" ? "p1" : "me";

  // Reparto ya acordado y guardado: cada parte se paga contra su propio techo.
  const activeSplitQuery = useQuery({
    queryKey: ["guest-split", demo],
    enabled: sessionReady && !demo && Boolean(bill),
    retry: false,
    refetchInterval: 8000,
    queryFn: async (): Promise<BillSplit | null> => {
      try {
        return await guest.activeSplit();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
  const activeSplit = activeSplitQuery.data ?? null;

  const [myParticipantRef, setMyParticipantRef] = useState<string | null>(null);
  const myParticipant = activeSplit?.participants.find((p) => p.ref === myParticipantRef) ?? null;

  const confirmSplit = useMutation({
    mutationFn: () => guest.createSplit(splitBody()),
    onSuccess: (split) => {
      setMyParticipantRef(myRef);
      activeSplitQuery.refetch();
      return split;
    },
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

  const { autoplayRef, splitPanelRef } = useBillAutoplay({
    autoplay,
    demo,
    bill,
    setSplitOpen,
    setMode,
    setMine,
    setStep,
    setTipPct,
  });

  const back = onBack ? { onBack } : {};

  if (!demo && (sessionError || (!sessionReady && !qr))) {
    return <SessionProblem error={sessionError} {...back} />;
  }

  if (!demo && (!sessionReady || billQuery.isLoading)) {
    return <BillLoading {...back} />;
  }

  if (!demo && billQuery.isError) {
    if (billQuery.error instanceof ApiError && billQuery.error.code === "GUEST_SESSION_INVALID") {
      guestSession.set(null);
    }
    return (
      <BillLoadError error={billQuery.error} onRetry={() => void billQuery.refetch()} {...back} />
    );
  }

  if (!bill) {
    return (
      <NoBill
        demo={demo}
        sessionEnded={sessionEnded}
        noBillReason={noBillReason}
        rejoining={rejoining}
        rejoinFailed={rejoinFailed}
        onRejoin={() => void rejoinTable()}
        {...back}
      />
    );
  }

  /**
   * Tres formas de no deber nada, y no son la misma.
   *
   * Esto era una sola condición -- «no queda nada por pagar» -- y con ella se
   * escondían el subtotal, el IVA, el servicio y el total, y se ponía en su
   * lugar «Todavía no hay nada en tu cuenta. En cuanto el restaurante añada lo
   * que has pedido...». Para una cuenta recién abierta es exactamente lo que
   * hay que decir. Para una que se acaba de pagar es mentira: los productos
   * siguen listados justo encima, y quien refresca después de pagar deja de
   * ver por cuánto le cobraron y encima lee que no ha pedido nada.
   *
   * Así que se separan. Lo que comparten -- que ni se puede dividir ni se
   * puede cobrar -- sigue siendo una sola condición; lo que se enseña, no.
   */
  const outstanding = BigInt(bill.remainingVes ?? bill.totalDueVes ?? "0");
  const paidSoFar = BigInt(bill.amountPaidVes ?? "0");
  const hasItems = (bill.items ?? []).length > 0;

  // `demo` siempre tiene cuenta, así que nunca cae en ninguna de las tres.
  const nothingToPay = !demo && outstanding === 0n && !activeSplit;
  // Pagada: hubo cobros y no queda nada.
  const settled = nothingToPay && paidSoFar > 0n;
  // Vacía de verdad: ni productos ni cobros. Sólo aquí tiene sentido decir que
  // aparecerá en cuanto el restaurante lo añada.
  const billIsEmpty = nothingToPay && !settled && !hasItems;
  // Hay cobros y todavía queda algo: lo que se paga ahora es el saldo, no el
  // total, así que es el saldo quien se lleva la cifra grande.
  const partlyPaid = paidSoFar > 0n && outstanding > 0n;

  // La propina se calcula en céntimos enteros sobre la parte del comensal.
  const shareMinor = preview ? BigInt(myShare(preview, mode)) : 0n;
  const tipMinor =
    tipPct === null
      ? parseMinorInput(tipCustom) || "0"
      : ((shareMinor * BigInt(tipPct)) / 100n).toString();

  /*
   * Lo que lleva escrito la barra flotante.
   *
   * Antes de que llegue el primer cálculo del servidor no hay parte: se enseña
   * lo que queda de la cuenta, que es lo que se pagaría con "Pagar todo" -- el
   * modo por defecto -- y nunca un cero, que parecería que no hay nada que
   * cobrar.
   */
  const dockShare = preview ? shareMinor : outstanding;
  /*
   * En el paso 1 la propina todavía no se ha preguntado.
   *
   * Sumarla ahí -- el valor por defecto es 10% -- ponía "Pagar la cuenta ·
   * 990,00" en la barra mientras "Tu parte" decía 900,00 dos centímetros más
   * arriba. Dos cifras distintas para lo mismo en la misma pantalla.
   */
  const dockTotal = step === 1 ? dockShare : dockShare + BigInt(tipMinor || "0");

  const setMineQty = (itemId: string, qty: number, max: number) =>
    setMine((prev) => {
      const next = { ...prev };
      const clamped = Math.max(0, Math.min(max, qty));
      if (clamped === 0) delete next[itemId];
      else next[itemId] = clamped;
      return next;
    });

  return (
    <div
      ref={autoplayRef}
      className={`mx-auto w-full max-w-md px-5 pb-16 ${embedded ? "" : "min-h-screen"}`}
    >
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

      {demo && (
        <p className="mb-3 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("demoBanner")}
        </p>
      )}

      {/* Sin nada que cobrar no hay recorrido que seguir: si otro comensal
          salda la cuenta mientras tú estás en el paso del banco, la cuenta
          se vuelve a enseñar en vez de quedarse escondida detrás de un paso
          que ya no lleva a ningún sitio. */}
      {/* Los tres pasos, arriba del todo y fuera de la tarjeta: responden
          «¿cuánto falta?» antes de que nadie lo pregunte. Sin cuenta que
          cobrar no hay recorrido, así que tampoco indicador. */}
      {!nothingToPay && !demo && (
        <div className="mt-1">
          <GuestStepIndicator current={step === 3 ? 3 : step === 2 ? 2 : 1} />
        </div>
      )}

      <BillSummary
        bill={bill}
        hidden={!(step === 1 || nothingToPay)}
        showVes={showVes}
        rateStr={rateStr}
        billIsEmpty={billIsEmpty}
        partlyPaid={partlyPaid}
        paidSoFar={paidSoFar}
      />

      {nothingToPay ? (
        <NothingToPay bill={bill} settled={settled} billIsEmpty={billIsEmpty} {...back} />
      ) : (
        /* En el paso 1, antes de abrir el reparto, esta tarjeta ya no tiene
           contenido: lo único que llevaba era "Tu parte", que repetía el total
           que la tarjeta de arriba y el botón de pagar ya dicen. Sin eso,
           dibujarla sería dejar un recuadro vacío en medio de la pantalla. */
        <SplitPanel
          panelRef={splitPanelRef}
          hidden={step === 3 || (step === 1 && !splitOpen)}
          step={step}
          splitOpen={splitOpen}
          demo={demo}
          bill={bill}
          mode={mode}
          onSelectMode={(next) => {
            setMode(next);
            setPreview(null);
          }}
          onPayWhole={() => {
            setMode("FULL");
            setPreview(null);
            setSplitOpen(false);
          }}
          diners={diners}
          setDiners={setDiners}
          mine={mine}
          setMineQty={setMineQty}
          amount={amount}
          setAmount={setAmount}
          calculating={splitMutation.isPending}
          splitError={splitMutation.isError ? splitMutation.error : null}
          preview={preview}
          tip={{ tipPct, setTipPct, tipCustom, setTipCustom, tipMinor }}
          confirm={{
            activeSplit,
            myName,
            setMyName,
            pending: confirmSplit.isPending,
            error: confirmSplit.isError ? confirmSplit.error : null,
            onConfirm: () => confirmSplit.mutate(),
          }}
        />
      )}

      {activeSplit && (
        <GuestSplitProgress
          split={activeSplit}
          mineRef={myParticipantRef}
          onPick={setMyParticipantRef}
          onChanged={() => void activeSplitQuery.refetch()}
        />
      )}

      {/* Cierra la rama de "hay algo que pagar": sin nada en la cuenta no se
          enseñan ni las formas de dividir ni el panel de pago. */}
      {!nothingToPay && step === 3 && (
        <GuestPaymentPanel
          bill={bill}
          demo={demo}
          tipVes={tipMinor}
          {...(myParticipant
            ? {
                splitParticipantId: myParticipant.id,
                shareRemainingVes: myParticipant.remainingVes,
                ...(myParticipant.availableVes
                  ? { shareAvailableVes: myParticipant.availableVes }
                  : {}),
              }
            : // Reparto calculado pero todavía no acordado: es la rama normal
              // de "divido, elijo lo mío y pago", donde nadie ha pulsado
              // "Acordar el reparto" porque no hace falta para pagar.
              //
              // Sin esto el panel cobraba `bill.remainingVes` -- la cuenta
              // entera -- mientras la barra de arriba prometía la parte.
              // Medido en un navegador sobre una cuenta de 15.272,02: la barra
              // decía "Continuar · 12.599,42" y el formulario del banco
              // aparecía relleno con 16.417,42, que es la cuenta de toda la
              // mesa más la propina de uno. El comensal que no se fijara
              // pagaba lo de los demás.
              //
              // Sin `splitParticipantId`: no hay reparto guardado, así que no
              // hay parte a la que atribuir el cobro. El importe sí se conoce,
              // y es lo único que este panel necesita.
              preview
              ? { shareRemainingVes: shareMinor.toString() }
              : {})}
          onClaimSent={() => setClaimSent(true)}
        />
      )}

      {/* Fuera del panel de pago a propósito: el panel se desmonta en cuanto la
          cuenta no debe nada, que es justo cuando la factura pasa a poder
          pedirse. Vivía dentro y por eso desaparecía al confirmarse el cobro.

          Y debajo del panel, no encima. El recibo aparece en el momento en que
          se envía el aviso, y montado arriba empujaba «Aviso enviado» dos
          pantallas hacia abajo justo cuando el comensal esperaba verlo: lo que
          quedaba a la vista era un recibo, que parece que todo terminó, en vez
          de «por verificar». El propio recibo dice que va debajo de todo. */}
      {!demo && <AfterPaying />}

      {!nothingToPay && (
        <PayDock
          step={step}
          setStep={setStep}
          splitOpen={splitOpen}
          mode={mode}
          hasPreview={Boolean(preview)}
          canSplit={canSplit}
          calculating={splitMutation.isPending}
          claimSent={claimSent}
          partlyPaid={partlyPaid}
          remainingVes={bill.remainingVes ?? "0"}
          dockTotal={dockTotal}
          onOpenSplit={() => {
            setSplitOpen(true);
            // Directo a marcar lo suyo, que es lo que hace casi todo el
            // mundo; las otras formas quedan a un toque (R13).
            setMode("ITEMS");
            setPreview(null);
            // Una fila por opción lee mejor que la rejilla de antes, pero
            // ocupa más alto: medido a 390 px, la cuarta quedaba debajo
            // de la barra. Llevar la vista al panel las pone las cuatro
            // a la vista en vez de dejarlas a que alguien intuya que hay
            // que bajar. El desplazamiento suave lo desactiva el sistema
            // de quien pide menos movimiento.
            requestAnimationFrame(() => scrollFrameTo(splitPanelRef.current));
          }}
        />
      )}
    </div>
  );
}
