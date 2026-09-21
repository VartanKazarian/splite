import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { applyRate, parseRate } from "@/lib/fiscal";
import {
  ApiError,
  formatBps,
  formatFxRate,
  formatMoney,
  guest,
  guestSession,
  parseMinorInput,
  type Bill,
  type BillSplit,
  type MenuCurrency,
  type SplitMode,
  type SplitPreview,
  type SplitPreviewRequest,
} from "@/lib/api";

import { GuestError } from "@/components/GuestError";
import { GuestPaymentPanel } from "@/components/GuestPaymentPanel";
import { GuestInvoiceOffer } from "@/components/GuestInvoiceOffer";
import { GuestItemSelector } from "@/components/GuestItemSelector";
import { GuestSplitModeSelector } from "@/components/GuestSplitModeSelector";
import { GuestSplitProgress } from "@/components/GuestSplitProgress";
import { GuestStepIndicator } from "@/components/GuestStepIndicator";
import { GuestReceipt } from "@/components/GuestReceipt";
import { recallPayment } from "@/lib/guest-payment";
import { demoBill, demoSplit } from "@/lib/demo-bill";

/** Referencia visual en Bs de un importe cotizado, a la tasa congelada de la cuenta. */
function toVes(minor: string, rate: string | null): string {
  if (!rate) return "0";
  try {
    return applyRate(BigInt(minor), parseRate(rate)).toString();
  } catch {
    return "0";
  }
}

/** Lo que le toca a este comensal según el modo elegido. */
/**
 * Bajar el marco de la demo, y sólo el marco.
 *
 * A mano y no con `scrollIntoView`, que además del contenedor arrastra la
 * página: una landing que se desplaza sola mientras alguien está leyendo otra
 * cosa es peor que una demo que no se mueve.
 */
function scrollBoxOf(el: HTMLElement | null): HTMLElement | null {
  let box: HTMLElement | null = el?.parentElement ?? null;
  while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
  return box;
}

function scrollFrameTo(el: HTMLElement | null) {
  const box = scrollBoxOf(el);
  if (!el || !box) return;
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12;
  box.scrollTo({ top, behavior: "smooth" });
}

function myShare(preview: SplitPreview, mode: SplitMode): string {
  if (mode === "EQUAL") return preview.allocations[0]?.amountVes ?? "0";
  const mineAlloc = preview.allocations.find((a) => a.participantId === "me");
  return mineAlloc?.amountVes ?? preview.allocations[0]?.amountVes ?? "0";
}

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
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<unknown>(null);

  // El QR trae un token firmado: se canjea una sola vez por sesión de invitado.
  useEffect(() => {
    if (demo) {
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const clean = () => {
        if (!qr || typeof window === "undefined") return;
        // El token no debe quedar en la barra de direcciones ni en capturas.
        const url = new URL(window.location.href);
        url.searchParams.delete("qr");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      };
      try {
        // Cualquier móvil, sin login: el token del QR siempre abre sesión nueva
        // (una sesión vieja en sessionStorage podría ser de otra mesa o estar caducada).
        if (qr) {
          guestSession.set(null);
          await guest.openSession(qr);
        }
        clean();
        if (!cancelled) setSessionReady(Boolean(guestSession.get()));
      } catch (error) {
        clean();
        if (!cancelled) setSessionError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qr, demo]);

  const billQuery = useQuery({
    queryKey: ["guest-bill", demo],
    enabled: sessionReady && !demo,
    retry: false,
    // El personal añade productos mientras la gente está sentada: sondeo cada 5s.
    refetchInterval: 5000,
    queryFn: async (): Promise<Bill | null> => {
      try {
        return await guest.bill<Bill>();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

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

  /*
   * El pago, en tres actos.
   *
   * Todo esto vivía en un solo scroll: la cuenta, el reparto, la propina y el
   * formulario del banco, siempre dibujados. El comensal que bajaba a mirar su
   * cuenta se encontraba un selector de banco y una casilla de clave **antes de
   * haber decidido qué le tocaba pagar**, y la propina se pedía a media
   * pantalla, antes de que nadie se hubiera comprometido a nada.
   *
   * Ahora cada decisión tiene su pantalla y la cifra viaja abajo, anclada:
   *
   *   1. qué pagas   2. propina   3. cómo pagas
   *
   * Se guarda en `sessionStorage` a propósito. La clave de C2P se pide al banco
   * por SMS: el comensal sale del navegador, abre los mensajes y vuelve -- y si
   * al volver la pestaña se ha recargado, sin esto aparecería en el paso 1 con
   * la clave ya caducada en la mano.
   */
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (demo) return 1;
    try {
      const saved = Number(sessionStorage.getItem("splite:paystep"));
      return saved === 2 || saved === 3 ? saved : 1;
    } catch {
      return 1;
    }
  });
  useEffect(() => {
    if (demo) return;
    try {
      sessionStorage.setItem("splite:paystep", String(step));
    } catch {
      /* Modo privado o almacenamiento bloqueado: el paso simplemente no
         sobrevive a una recarga, que es como estaba antes. */
    }
  }, [step, demo]);

  const demoBillData = useMemo(() => (demo ? demoBill() : null), [demo]);
  const bill = demo ? demoBillData : (billQuery.data ?? null);
  const rateStr = bill?.fxRateVesPerUnit ?? bill?.fxRate ?? null;
  const showVes = Boolean(bill && bill.currency !== "VES" && rateStr);

  /** El cuerpo del reparto: idéntico para la previsualización y para acordarlo. */
  const buildSplitBody = (): SplitPreviewRequest => {
    const remaining = BigInt(bill?.remainingVes ?? bill?.totalDueVes ?? "0");
    const me = { id: "me", ...(myName.trim() ? { name: myName.trim() } : {}) };
    if (mode === "FULL") return { mode, participants: [me] };
    if (mode === "EQUAL") {
      return {
        mode,
        // A partes iguales, sólo se conoce el nombre de quien está mirando:
        // los demás siguen siendo «Comensal N» hasta que cada uno escanee.
        participants: Array.from({ length: Math.max(2, diners) }, (_, i) =>
          i === 0 ? { ...me, id: "p1" } : { id: `p${i + 1}` },
        ),
      };
    }
    if (mode === "ITEMS") {
      return {
        mode,
        participants: [me, { id: "others" }],
        claims: (bill?.items ?? []).flatMap((item) => {
          const qty = mine[item.id] ?? 0;
          const rest = Math.max(0, (item.quantity ?? 1) - qty);
          return [
            ...(qty > 0 ? [{ itemId: item.id, quantity: qty, participantIds: ["me"] }] : []),
            ...(rest > 0 ? [{ itemId: item.id, quantity: rest, participantIds: ["others"] }] : []),
          ];
        }),
      };
    }
    const cents = BigInt(parseMinorInput(amount) || "0");
    const rest = remaining > cents ? remaining - cents : 0n;
    return {
      mode,
      participants: [
        { ...me, amountVes: cents.toString() },
        { id: "others", amountVes: rest.toString() },
      ],
    };
  };

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
      return guest.splitPreview<SplitPreview>(buildSplitBody());
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
    mutationFn: () => guest.createSplit(buildSplitBody()),
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

  /**
   * El guion de la demo automática.
   *
   * Mueve el estado de esta pantalla, no clics simulados sobre sus botones:
   * disparar eventos del DOM desde fuera ata la demo a los textos y a la
   * disposición de los controles, y se rompe en silencio la primera vez que
   * alguien renombra un botón. Aquí, si un paso deja de existir, no compila.
   *
   * Las líneas salen de `bill.items` y no de ids escritos a mano, por lo mismo:
   * la cuenta de ejemplo puede cambiar y esto sigue señalando a dos platos.
   *
   * El reparto no hay que pedirlo: el efecto de arriba recalcula la parte sola
   * en cuanto cambian `mode` o `mine`. El guion sólo toca lo que tocaría un
   * dedo.
   */
  const autoplayRef = useRef<HTMLDivElement>(null);
  const splitPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoplay || !demo || !bill) return;
    const items = bill.items ?? [];
    // Un plato de varias unidades y otro también, para que se vea que se
    // reparten unidades y no líneas enteras.
    const first = items.find((i) => i.quantity >= 2);
    const second = items.find((i) => i !== first && i.quantity >= 2);
    if (!first || !second) return;
    const mineFinal = { [first.id]: 1, [second.id]: 2 };

    // Quien pidió que nada se mueva recibe el final, no el recorrido.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSplitOpen(true);
      setMode("ITEMS");
      setMine(mineFinal);
      return;
    }
    // El guion también avanza de paso: desde que la propina vive en el paso 2,
    // ponerla sin cambiar de pantalla dejaba el último tiempo de la demo
    // ocurriendo donde nadie lo ve.

    const steps: [number, () => void][] = [
      [700, () => setSplitOpen(true)],
      // Bajar el marco hasta donde está pasando la cosa. Sin esto el reparto
      // ocurre por debajo del borde y la demo parece que no hace nada.
      [900, () => scrollFrameTo(splitPanelRef.current)],
      [1600, () => setMode("ITEMS")],
      [2500, () => setMine({ [first.id]: 1 })],
      [3400, () => setMine(mineFinal)],
      [4600, () => setStep(2)],
      [5300, () => setTipPct(15)],
    ];
    const timers = steps.map(([at, run]) => setTimeout(run, at));

    /*
     * Cualquier gesto lo detiene donde esté.
     *
     * Es la diferencia con un vídeo, y no puede quedar a medias: si el guion
     * siguiera corriendo bajo el dedo, cambiaría la selección que la persona
     * acaba de hacer y parecería que la pantalla va por su cuenta.
     */
    const stop = () => timers.forEach(clearTimeout);
    /*
     * Los oyentes van en el marco, no en esta pantalla.
     *
     * Los eventos suben, no bajan: colgados aquí dentro, un toque en el borde
     * del marco no los alcanzaba. Y sobre todo **la rueda tampoco**, así que
     * quien desplazase el marco a mano se encontraba al guion desplazándolo de
     * vuelta -- medido: el recorrido llegaba hasta el final peleando con el
     * ratón. `wheel` y `touchmove` son gestos de una persona; `scroll` no vale,
     * porque lo dispara el propio guion al bajar el marco y se cancelaría solo.
     */
    const el = scrollBoxOf(autoplayRef.current) ?? autoplayRef.current;
    const events = ["pointerdown", "keydown", "wheel", "touchmove"] as const;
    events.forEach((e) => el?.addEventListener(e, stop, { passive: true }));
    return () => {
      timers.forEach(clearTimeout);
      events.forEach((e) => el?.removeEventListener(e, stop));
    };
  }, [autoplay, demo, bill]);

  const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : undefined);

  if (!demo && (sessionError || (!sessionReady && !qr))) {
    const code = codeOf(sessionError);
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
        {sessionError && !code ? <GuestError error={sessionError} /> : null}
      </Shell>
    );
  }

  if (!demo && (!sessionReady || billQuery.isLoading)) {
    return (
      <Shell {...(onBack ? { onBack } : {})}>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </Shell>
    );
  }

  if (!demo && billQuery.isError) {
    const code = codeOf(billQuery.error);
    if (code === "GUEST_SESSION_INVALID") {
      guestSession.set(null);
      return (
        <Shell {...(onBack ? { onBack } : {})}>
          <h1 className="text-3xl">{t("yourBill")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("sessionExpired")}</p>
        </Shell>
      );
    }
    return (
      <Shell {...(onBack ? { onBack } : {})}>
        <h1 className="text-3xl">{t("errorTitle")}</h1>
        <GuestError error={billQuery.error} />
      </Shell>
    );
  }

  if (!bill) {
    /*
     * Dos situaciones muy distintas caen aquí, y decirles lo mismo era
     * desconcertante.
     *
     * Quien escanea una mesa sin cuenta necesita saber precisamente eso. Pero
     * quien **acaba de pagar** también acaba aquí -- confirmar el cobro cierra
     * la cuenta -- y leer «Sin cuenta abierta» después de pagar parece que algo
     * salió mal. Si este teléfono declaró un pago, es la segunda.
     */
    const justPaid = !demo && recallPayment() !== null;
    return (
      <Shell {...(onBack ? { onBack } : {})}>
        <h1 className="text-3xl">{justPaid ? t("paidThanks") : t("noOpenBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {justPaid ? t("paidThanksBody") : t("oneOpenBill")}
        </p>
        {/*
          Aquí cae justamente quien acaba de que le confirmen el pago: confirmar
          cierra la cuenta, y sin cuenta abierta esta pantalla es lo único que
          queda. Si la factura no se ofreciera aquí, la promesa de pedirla
          «cuando el restaurante confirme» no tendría dónde cumplirse.
        */}
        {!demo && <GuestInvoiceOffer />}
        {/* Debajo de la oferta: primero la acción que caduca -- pedir factura --
            y después el recibo, que es el registro y no se va a ninguna parte. */}
        {!demo && <GuestReceipt />}
      </Shell>
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

      <div className={`surface p-6 ${step === 1 || nothingToPay ? "" : "hidden"}`}>
        <h1 className="text-3xl">{t("yourBill")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("quotedIn")} {t(`currency${bill.currency}` as never)}
        </p>

        {/* La lista trae su propia línea superior y su relleno, así que sin
            productos quedaban dos separadores seguidos con un hueco en medio y
            nada dentro. Una cuenta sin líneas no dibuja la lista. */}
        {(bill.items ?? []).length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            {(bill.items ?? []).map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>
                  {item.quantity} × {item.name}
                </span>
                {/* El bolívar debajo del dólar y no al lado. Al lado tenía un
                    ancho fijo de 96 px, que un importe de siete dígitos
                    desborda, y era el único número de la fila que no llevaba
                    la cara de cifras -- salía en DM Sans, sin tabular. */}
                <span className="flex shrink-0 flex-col items-end">
                  <span className="money-md">{formatMoney(item.subtotalMinor, bill.currency)}</span>
                  {showVes && (
                    <span className="money-sm text-muted-foreground">
                      {formatMoney(toVes(item.subtotalMinor, rateStr), "VES")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Sin nada en la cuenta, cuatro filas de ceros no informan de nada:
            el mensaje de abajo ya dice lo que pasa. */}
        <div
          className={`mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground ${
            billIsEmpty ? "hidden" : ""
          }`}
        >
          <MoneyRow label={t("subtotal")} amount={bill.subtotalMinor} currency={bill.currency} />
          <MoneyRow
            label={`${t("iva")} ${formatBps(bill.vatBps)}`}
            amount={bill.vatMinor}
            currency={bill.currency}
          />
          <MoneyRow
            label={`${t("service")} ${formatBps(bill.serviceChargeBps)}`}
            amount={bill.serviceChargeMinor}
            currency={bill.currency}
          />
        </div>

        {/* Un total, no dos, y la cifra grande es la que se paga ahora.
            Había dos: "Total" en la moneda de la carta a 36 px y, debajo,
            "Total a pagar" en bolívares a 30. El mismo importe dos veces,
            compitiendo -- y el grande era el que nadie paga. Quien mira esto
            va a transferir bolívares desde su banco.
            Con cobros parciales, lo que se paga ya no es el total sino lo que
            queda, así que la cifra grande es esa y el total baja a fila de
            apoyo. Una sola de 32 px por tarjeta: si el total y el pendiente
            fueran los dos grandes, volveríamos a tener dos importes
            disputándose la mirada.
            El rótulo va encima y no al lado, así el importe dispone de los
            305 px de la tarjeta enteros y no se parte. Con la carta en
            bolívares no hay conversión: ni subtítulo ni tasa -- enseñaba una
            tasa de 1, que no significa nada. */}
        <div
          className={`mt-4 flex flex-col gap-0.5 border-t border-border pt-4 ${
            billIsEmpty ? "hidden" : ""
          }`}
        >
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {partlyPaid ? t("outstanding") : t("totalPayable")}
          </span>
          <span className="money-xl">
            {formatMoney(partlyPaid ? bill.remainingVes : bill.totalDueVes, "VES")}
          </span>

          {/* Con cobros hechos, quien llega el tercero necesita dos cifras: lo
              que queda, para saber cuánto puede pagar, y lo que era la cuenta,
              para entender por qué no coincide con lo que vio en la mesa. La
              original va tachada -- tachado es lo ya cobrado -- y en pequeño,
              porque no es la que se paga. */}
          {partlyPaid && (
            <>
              <span className="mt-1 text-[12px] text-muted-foreground">
                {t("billWas").replace("{amount}", formatMoney(bill.totalDueVes ?? "0", "VES"))}
              </span>
              <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${
                      (Number(paidSoFar) / Math.max(1, Number(BigInt(bill.totalDueVes ?? "0")))) *
                      100
                    }%`,
                  }}
                />
              </div>
            </>
          )}

          {/* El equivalente en la moneda de la carta acompaña al total, no al
              pendiente: convertir un saldo parcial a dólares es un número que
              no aparece en ninguna parte y que nadie va a comprobar. */}
          {bill.currency !== "VES" && !partlyPaid && (
            <span className="money-md text-muted-foreground">
              {formatMoney(bill.totalDue, bill.currency)}
            </span>
          )}
          {bill.currency !== "VES" && (bill.fxRateVesPerUnit ?? bill.fxRate) && (
            <span className="money-sm mt-1 text-muted-foreground">
              {t("bcvRate")} {formatFxRate(bill.fxRateVesPerUnit ?? bill.fxRate!)}
            </span>
          )}
        </div>
      </div>

      {/* Una cuenta recién abierta no tiene nada, y es justo cuando más gente
          escanea: te sientas, ves el código y lo pruebas antes de que el
          mesero haya metido nada. Ofrecer "Pagar todo" y las tres formas de
          dividir sobre cero terminaba en un aviso rojo con un código de la API
          -- SPLIT_NOTHING_OUTSTANDING -- que además decía que la cuenta ya
          estaba pagada. No lo estaba: estaba vacía. */}
      {nothingToPay ? (
        <div className="surface mt-4 p-6">
          {/* Pagada, vacía, o con productos que no suman nada. Las tres se
              quedan sin división y sin cobro, y las tres decían lo mismo. */}
          <h2 className="text-xl">
            {settled ? t("billSettledTitle") : billIsEmpty ? t("billEmptyTitle") : t("nothingDue")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {settled
              ? `${t("billSettledBody")} ${formatMoney(bill.amountPaidVes ?? "0", "VES")}.`
              : billIsEmpty
                ? t("billEmptyBody")
                : t("nothingDueBody")}
          </p>
          {/* "Mientras tanto, mira la carta" sólo tiene sentido mientras se
              espera algo. Para una cuenta pagada no hay mientras tanto. */}
          {onBack && (
            <button onClick={onBack} className="mt-4 text-sm underline underline-offset-2">
              {billIsEmpty ? t("billEmptyMenu") : t("theMenu")}
            </button>
          )}
        </div>
      ) : (
        /* En el paso 1, antes de abrir el reparto, esta tarjeta ya no tiene
           contenido: lo único que llevaba era "Tu parte", que repetía el total
           que la tarjeta de arriba y el botón de pagar ya dicen. Sin eso,
           dibujarla sería dejar un recuadro vacío en medio de la pantalla. */
        <div
          ref={splitPanelRef}
          className={`surface mt-4 p-6 ${step === 3 || (step === 1 && !splitOpen) ? "hidden" : ""}`}
        >
          {/* Las cuatro formas de repartir, sólo una vez que se ha elegido
              dividir. Antes vivía aquí también el botón que abre esto; se
              mudó a la barra de abajo, a la misma altura que pagar, porque
              dividir es la otra mitad de para qué se abre esta pantalla y no
              una opción escondida dentro de la tarjeta. */}
          {step !== 1 || !splitOpen ? null : (
            <GuestSplitModeSelector
              // Mientras el modo siga en FULL nadie ha elegido cómo repartir:
              // es el valor por defecto del estado, no una decisión.
              selected={mode === "FULL" ? null : mode}
              onSelect={(next) => {
                setMode(next);
                setPreview(null);
                // "Pagar toda la cuenta" no es una forma de dividir: es decir
                // que no se divide. Así que cierra el panel y devuelve la
                // pareja de botones, en vez de dejar abierto un reparto de uno.
                if (next === "FULL") setSplitOpen(false);
              }}
            />
          )}

          {step === 1 && mode === "EQUAL" && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("howManyDiners")}
              </p>
              <div className="mt-3 flex items-center gap-4">
                <button
                  onClick={() => setDiners((n) => Math.max(2, n - 1))}
                  className="h-10 w-10 rounded-full border border-border text-lg text-muted-foreground"
                >
                  −
                </button>
                <span className="figure text-3xl">{diners}</span>
                <button
                  onClick={() => setDiners((n) => Math.min(50, n + 1))}
                  className="h-10 w-10 rounded-full border border-border text-lg text-muted-foreground"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {step === 1 && mode === "ITEMS" && (
            <GuestItemSelector
              items={bill.items ?? []}
              mine={mine}
              currency={bill.currency}
              onChange={setMineQty}
            />
          )}

          {step === 1 && mode === "CUSTOM" && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("yourAmount")}
              </p>
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-3 w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-sm outline-none focus:border-ring"
              />
            </div>
          )}

          {splitMutation.isPending && (
            <p className="mt-5 text-xs text-muted-foreground">{t("calculating")}</p>
          )}

          {splitMutation.isError && <GuestError error={splitMutation.error} />}

          {/* Sólo cuando hay un reparto de verdad. Pagando la cuenta entera,
              "Tu parte" era el total dicho por tercera vez en la misma
              pantalla, y presentado como una decisión ya tomada: o divides, o
              pagas todo, y eso se elige abajo. */}
          {preview && !splitMutation.isPending && !(step === 1 && mode === "FULL") && (
            <div className="mt-5 border-t border-border pt-4">
              {/* Una cifra grande por tarjeta, y es la que se puede pagar
                  desde ella. Sin propina puesta, eso es tu parte; en cuanto
                  hay propina, el importe con propina toma el sitio y esto baja
                  a fila normal. Había tres cifras de 30, 30 y 24 px, y la
                  pequeña era la única que se transfiere de verdad. */}
              {tipMinor === "0" ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    {mode === "EQUAL" ? t("perPerson") : t("yourShare")}
                  </span>
                  <span className="money-xl">{formatMoney(myShare(preview, mode), "VES")}</span>
                </div>
              ) : (
                <div className="flex justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    {mode === "EQUAL" ? t("perPerson") : t("yourShare")}
                  </span>
                  <span className="money-md">{formatMoney(myShare(preview, mode), "VES")}</span>
                </div>
              )}
              {/* Las dos filas de apoyo sólo dicen algo cuando el reparto es de
                  verdad. Pagando la cuenta entera valen lo mismo que el titular,
                  y la tarjeta enseñaba el mismo importe tres veces seguidas -- en
                  serif arriba y en la fuente del texto justo debajo, que parecía
                  un fallo de composición más que una jerarquía. */}
              {(preview.outstandingVes !== myShare(preview, mode) ||
                preview.totalAllocatedVes !== myShare(preview, mode)) && (
                <>
                  <div className="mt-3 flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>{t("outstanding")}</span>
                    <span className="money-sm">{formatMoney(preview.outstandingVes, "VES")}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>{t("allocated")}</span>
                    <span className="money-sm">
                      {formatMoney(preview.totalAllocatedVes, "VES")}
                    </span>
                  </div>
                </>
              )}
              {/* La propina se pregunta cuando ya hay una cifra, no a media
                  pantalla y antes de que nadie se haya comprometido a pagar. */}
              <div className={`mt-5 border-t border-border pt-4 ${step === 2 ? "" : "hidden"}`}>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {t("tipTitle")}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("tipHint")}</p>
                {/* Seis columnas y la primera ocupa dos: con cinco iguales,
                    "Sin propina" era la única etiqueta de dos palabras y se
                    partía en dos líneas, así que la fila de propina salía más
                    alta por su lado izquierdo. Los porcentajes siguen midiendo
                    lo mismo entre ellos.
                    Y 44 px de alto: medían 34 y son lo que toca un comensal de
                    pie, con el teléfono en una mano, para decidir cuánto deja.
                    Es la pantalla que usa quien paga; no es donde se ahorra
                    altura. */}
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {[0, 10, 15, 20].map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setTipPct(p);
                        setTipCustom("");
                      }}
                      className={`min-h-11 rounded-lg border px-2 text-xs transition-colors ${
                        p === 0 ? "col-span-2" : ""
                      } ${
                        tipPct === p
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {p === 0 ? t("tipNone") : `${p}%`}
                    </button>
                  ))}
                  <button
                    onClick={() => setTipPct(null)}
                    className={`min-h-11 rounded-lg border px-2 text-xs transition-colors ${
                      tipPct === null
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {t("tipOther")}
                  </button>
                </div>
                {tipPct === null && (
                  <input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={tipCustom}
                    onChange={(e) => setTipCustom(e.target.value)}
                    className="mt-3 min-h-11 w-full rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
                  />
                )}
                <div className="mt-3 flex justify-between gap-3 text-sm text-muted-foreground">
                  <span>{t("tipAmount")}</span>
                  <span className="money-md">{formatMoney(tipMinor, "VES")}</span>
                </div>
                {tipMinor !== "0" && (
                  <div className="mt-3 flex flex-col gap-0.5 border-t border-border pt-3 text-foreground">
                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {t("yourTotalWithTip")}
                    </span>
                    <span className="money-xl">
                      {formatMoney(
                        (BigInt(myShare(preview, mode)) + BigInt(tipMinor)).toString(),
                        "VES",
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Sólo cuando de verdad se está dividiendo. Con "Pagar todo"
                  -- que ahora es el camino por defecto y no una opción que se
                  elige -- un botón llamado "Confirmar división" aparecía sin
                  que nadie hubiera dividido nada. Pagar la cuenta entera no
                  necesita guardar ningún reparto: lo hace el panel de pago. */}
              {step === 1 && !demo && mode !== "FULL" && (
                <div className="mt-4 border-t border-border pt-4">
                  {/*
                    El nombre va aquí y no en un paso propio: es una línea
                    opcional justo antes de acordar el reparto, que es el
                    momento en que empieza a servir para algo. Sin él la lista
                    dice «Comensal 2» y funciona igual -- el valor es para los
                    demás, que ven quién ha pagado sin preguntarlo en voz alta.
                  */}
                  {/* Con un reparto ya acordado el nombre se pide abajo, sobre
                      la parte que el comensal acaba de tomar. Pedirlo aquí
                      también ponía dos campos «Tu nombre» en la misma pantalla,
                      preguntando lo mismo dos veces. El botón de acordar o
                      reemplazar se queda: ésa es otra decisión. */}
                  {!activeSplit && (
                    <>
                      <label className="block text-xs uppercase tracking-widest text-muted-foreground">
                        {t("yourNameOptional")}
                        <input
                          data-testid="guest-my-name"
                          value={myName}
                          onChange={(e) => setMyName(e.target.value)}
                          maxLength={80}
                          autoComplete="given-name"
                          placeholder={t("yourNamePlaceholder")}
                          className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-transparent px-3 text-base"
                        />
                      </label>
                      <p className="mb-4 mt-1.5 text-[11px] text-muted-foreground">
                        {t("yourNameWhy")}
                      </p>
                    </>
                  )}
                  <button
                    data-testid="guest-split-confirm"
                    disabled={confirmSplit.isPending}
                    onClick={() => confirmSplit.mutate()}
                    className="w-full rounded-lg border border-primary bg-primary/15 px-4 py-3 text-sm text-foreground disabled:opacity-40"
                  >
                    {confirmSplit.isPending
                      ? t("loading")
                      : activeSplit
                        ? t("splitReplace")
                        : t("splitConfirm")}
                  </button>
                  {/* Con un reparto ya acordado, el botón reemplaza en vez de
                      crear, y hay que decirlo antes de pulsarlo: por detrás el
                      anterior se anula. El servidor sólo lo permite mientras
                      nadie haya pagado -- en cuanto hay dinero contra una
                      parte, responde y el reparto viejo se queda. */}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {activeSplit ? t("splitReplaceNote") : t("splitConfirmNote")}
                  </p>
                  {confirmSplit.isError && <GuestError error={confirmSplit.error} />}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSplit && (
        <GuestSplitProgress
          split={activeSplit}
          mineRef={myParticipantRef}
          onPick={setMyParticipantRef}
          onChanged={() => void activeSplitQuery.refetch()}
        />
      )}

      {/* Fuera del panel de pago a propósito: el panel se desmonta en cuanto la
          cuenta no debe nada, que es justo cuando la factura pasa a poder
          pedirse. Vivía dentro y por eso desaparecía al confirmarse el cobro. */}
      {!demo && <GuestInvoiceOffer />}
      {!demo && <GuestReceipt />}

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
        />
      )}

      {/* ---------------------------------------------------------------
          La barra flotante.
          `sticky` y no `fixed`: esta misma pantalla vive dentro del marco de
          teléfono de la landing, y un elemento fijo ahí dentro se ancla a la
          ventana del navegador y se escapa del marco. Pegada al fondo del
          contenedor que hace scroll, funciona en los dos sitios.
          --------------------------------------------------------------- */}
      {!nothingToPay && (
        <div className="sticky bottom-0 z-10 -mx-5 mt-4 bg-gradient-to-t from-background from-65% to-transparent px-5 pb-4 pt-6">
          {/* Dividir y pagar, lado a lado y con el mismo peso: son las dos
              cosas que se puede querer hacer aquí, y antes una era un botón
              lleno y la otra un enlace dentro de la tarjeta. El importe se
              apila bajo su etiqueta porque a media pantalla no cabe en la
              misma línea, y quitarlo no era opción: es lo que convierte el
              botón en una confirmación. */}
          {step === 1 && !splitOpen && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                data-testid="guest-split-open"
                onClick={() => {
                  setSplitOpen(true);
                  // Una fila por opción lee mejor que la rejilla de antes, pero
                  // ocupa más alto: medido a 390 px, la cuarta quedaba debajo
                  // de la barra. Llevar la vista al panel las pone las cuatro
                  // a la vista en vez de dejarlas a que alguien intuya que hay
                  // que bajar. El desplazamiento suave lo desactiva el sistema
                  // de quien pide menos movimiento.
                  requestAnimationFrame(() => scrollFrameTo(splitPanelRef.current));
                }}
                className="flex min-h-14 items-center justify-center rounded-full border border-border bg-background px-4 text-center text-[15px] font-medium transition-colors hover:bg-secondary"
              >
                {t("splitTheBill")}
              </button>
              <button
                type="button"
                data-testid="guest-pay-full"
                onClick={() => setStep(2)}
                className="flex min-h-14 flex-col items-center justify-center rounded-full bg-primary px-4 text-primary-foreground shadow-[0_12px_26px_-14px] shadow-primary transition-opacity hover:opacity-95"
              >
                <span className="text-[15px] font-medium leading-tight">{t("payTheBill")}</span>
                <span className="money-sm leading-tight opacity-90">
                  {formatMoney(dockTotal.toString(), "VES")}
                </span>
              </button>
            </div>
          )}

          {/* Dividiendo, pagar la cuenta entera deja de ofrecerse: se acaba de
              decir que no. Mientras no se elija cómo repartir no hay importe
              que confirmar, así que tampoco hay botón -- la decisión está
              arriba, en las cuatro opciones. */}
          {step < 3 && !(step === 1 && !splitOpen) && !(step === 1 && mode === "FULL") && (
            <button
              type="button"
              data-testid="guest-continue"
              onClick={() => setStep(step === 1 ? 2 : 3)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-[0_12px_26px_-14px] shadow-primary transition-opacity hover:opacity-95"
            >
              <span>
                {step === 1
                  ? mode === "FULL"
                    ? t("payTheBill")
                    : t("payMyShare")
                  : t("stepContinue")}
              </span>
              <span aria-hidden className="opacity-50">
                ·
              </span>
              <span className="money-md">{formatMoney(dockTotal.toString(), "VES")}</span>
            </button>
          )}
          {step > 1 && (
            <button
              type="button"
              data-testid="guest-step-back"
              onClick={() => setStep(step === 2 ? 1 : 2)}
              className={`min-h-11 w-full rounded-full border border-border text-[13px] text-muted-foreground transition-colors hover:bg-secondary ${
                step < 3 ? "mt-2" : ""
              }`}
            >
              {step === 2 ? t("backToBill") : t("backToTip")}
            </button>
          )}
          {/* Sólo cuando hay algo que decir que la pantalla no enseñe ya: qué
              falta por elegir, o que se está pagando sobre un saldo parcial.
              «Nadie más queda comprometido» se cayó por lo contrario -- era
              tranquilizar por escrito algo que el importe y los dos botones ya
              dicen. */}
          {step === 1 && (splitOpen ? mode === "FULL" : partlyPaid) && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {splitOpen
                ? t("chooseHowToSplit")
                : t("overRemaining").replace(
                    "{amount}",
                    formatMoney(bill.remainingVes ?? "0", "VES"),
                  )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MoneyRow({
  label,
  amount,
  currency,
  highlight,
}: {
  label: string;
  amount: string;
  currency: MenuCurrency;
  highlight?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${highlight ? "text-foreground" : ""}`}>
      <span>{label}</span>
      <span className="money-md">{formatMoney(amount, currency)}</span>
    </div>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
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
