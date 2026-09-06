import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";

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
function myShare(preview: SplitPreview, mode: SplitMode): string {
  if (mode === "EQUAL") return preview.allocations[0]?.amountVes ?? "0";
  const mineAlloc = preview.allocations.find((a) => a.participantId === "me");
  return mineAlloc?.amountVes ?? preview.allocations[0]?.amountVes ?? "0";
}

export function GuestBillScreen({
  qr,
  demo = false,
  onBack,
}: {
  qr?: string;
  demo?: boolean;
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

  const demoBillData = useMemo(() => (demo ? demoBill() : null), [demo]);
  const bill = demo ? demoBillData : (billQuery.data ?? null);
  const rateStr = bill?.fxRateVesPerUnit ?? bill?.fxRate ?? null;
  const showVes = Boolean(bill && bill.currency !== "VES" && rateStr);

  /** El cuerpo del reparto: idéntico para la previsualización y para acordarlo. */
  const buildSplitBody = (): SplitPreviewRequest => {
    const remaining = BigInt(bill?.remainingVes ?? bill?.totalDueVes ?? "0");
    if (mode === "FULL") return { mode, participants: [{ id: "me" }] };
    if (mode === "EQUAL") {
      return {
        mode,
        participants: Array.from({ length: Math.max(2, diners) }, (_, i) => ({ id: `p${i + 1}` })),
      };
    }
    if (mode === "ITEMS") {
      return {
        mode,
        participants: [{ id: "me" }, { id: "others" }],
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
        { id: "me", amountVes: cents.toString() },
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
    return (
      <Shell {...(onBack ? { onBack } : {})}>
        <h1 className="text-3xl">{t("noOpenBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("oneOpenBill")}</p>
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

  // "Pagar todo" ya no es una opción entre cuatro: es lo que pasa si no tocas
  // nada. Vuelve a la lista sólo para poder deshacer una división empezada.
  const modes: { id: SplitMode; label: string }[] = [
    { id: "FULL", label: t("payAll") },
    { id: "ITEMS", label: t("splitItems") },
    { id: "EQUAL", label: t("splitEven") },
    { id: "CUSTOM", label: t("custom") },
  ];

  // La propina se calcula en céntimos enteros sobre la parte del comensal.
  const shareMinor = preview ? BigInt(myShare(preview, mode)) : 0n;
  const tipMinor =
    tipPct === null
      ? parseMinorInput(tipCustom) || "0"
      : ((shareMinor * BigInt(tipPct)) / 100n).toString();

  const setMineQty = (itemId: string, qty: number, max: number) =>
    setMine((prev) => {
      const next = { ...prev };
      const clamped = Math.max(0, Math.min(max, qty));
      if (clamped === 0) delete next[itemId];
      else next[itemId] = clamped;
      return next;
    });

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16">
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

      <div className="surface p-6">
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
          {partlyPaid && (
            <div className="mb-3 flex flex-col gap-1 text-sm text-muted-foreground">
              <MoneyRow label={t("total")} amount={bill.totalDueVes} currency="VES" />
              <MoneyRow label={t("alreadyPaid")} amount={bill.amountPaidVes} currency="VES" />
            </div>
          )}

          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {partlyPaid ? t("outstanding") : t("totalPayable")}
          </span>
          <span className="money-xl">
            {formatMoney(partlyPaid ? bill.remainingVes : bill.totalDueVes, "VES")}
          </span>

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
        <div className="surface mt-4 p-6">
          {/* Pagarlo todo es lo que hace la mayoría, y ya es el modo por
              defecto: no necesita un botón compitiendo con los otros tres. Las
              cuatro opciones con el mismo peso obligaban a leerlas y decidir
              antes de poder hacer nada. Dividir sigue estando a un toque. */}
          {!splitOpen ? (
            <button
              onClick={() => setSplitOpen(true)}
              className="w-full rounded-full border border-border px-4 py-3 text-sm transition-colors hover:bg-secondary"
            >
              {t("splitTheBill")}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {modes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setMode(m.id);
                    setPreview(null);
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                    mode === m.id
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {mode === "EQUAL" && (
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

          {mode === "ITEMS" && (
            <div className="mt-5 space-y-2">
              <p className="text-xs text-muted-foreground">{t("selectYourItems")}</p>
              {(bill.items ?? []).map((item) => {
                const max = item.quantity ?? 1;
                const qty = mine[item.id] ?? 0;
                const on = qty > 0;
                const unit = (BigInt(item.subtotalMinor) * BigInt(qty)) / BigInt(max || 1);

                // Si solo hay una unidad, basta con marcar/desmarcar el producto.
                if (max === 1) {
                  return (
                    <button
                      key={item.id}
                      onClick={() => setMineQty(item.id, on ? 0 : 1, max)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        on ? "border-primary bg-primary/15" : "border-border text-muted-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on ? "border-primary bg-primary/40" : "border-border"
                          }`}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span>{item.name}</span>
                      </span>
                      <span className="w-20 shrink-0 text-right">
                        {formatMoney(item.subtotalMinor, bill.currency)}
                      </span>
                    </button>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      on ? "border-primary bg-primary/15" : "border-border text-muted-foreground"
                    }`}
                  >
                    <button
                      onClick={() => setMineQty(item.id, on ? 0 : 1, max)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? "border-primary bg-primary/40" : "border-border"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span>{item.name}</span>
                    </button>

                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <button
                          aria-label="-"
                          onClick={() => setMineQty(item.id, qty - 1, max)}
                          disabled={qty <= 0}
                          className="h-7 w-7 rounded-full border border-border text-sm disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-5 text-center figure">{qty}</span>
                        <button
                          aria-label="+"
                          onClick={() => setMineQty(item.id, qty + 1, max)}
                          disabled={qty >= max}
                          className="h-7 w-7 rounded-full border border-border text-sm disabled:opacity-30"
                        >
                          +
                        </button>
                      </span>
                      <span className="w-20 shrink-0 text-right">
                        {formatMoney(unit.toString(), bill.currency)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {mode === "CUSTOM" && (
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

          {preview && !splitMutation.isPending && (
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
              <div className="mt-5 border-t border-border pt-4">
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
              <p className="mt-3 text-[11px] text-muted-foreground">{t("guestNoPay")}</p>

              {/* Sólo cuando de verdad se está dividiendo. Con "Pagar todo"
                  -- que ahora es el camino por defecto y no una opción que se
                  elige -- un botón llamado "Confirmar división" aparecía sin
                  que nadie hubiera dividido nada. Pagar la cuenta entera no
                  necesita guardar ningún reparto: lo hace el panel de pago. */}
              {!demo && !activeSplit && mode !== "FULL" && (
                <div className="mt-4 border-t border-border pt-4">
                  <button
                    disabled={confirmSplit.isPending}
                    onClick={() => confirmSplit.mutate()}
                    className="w-full rounded-lg border border-primary bg-primary/15 px-4 py-3 text-sm text-foreground disabled:opacity-40"
                  >
                    {confirmSplit.isPending ? t("loading") : t("splitConfirm")}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Al confirmarla, cada parte queda guardada y se paga por separado.
                  </p>
                  {confirmSplit.isError && <GuestError error={confirmSplit.error} />}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSplit && (
        <div className="surface mt-4 p-6">
          <h2 className="text-xl">{t("splitAgreed")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sobre {formatMoney(activeSplit.basisVes, "VES")} pendientes al acordarla.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {activeSplit.participants.map((p, i) => {
              const isMine = p.ref === myParticipantRef;
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                    isMine ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <button onClick={() => setMyParticipantRef(p.ref)} className="flex-1 text-left">
                    <span>{p.name ?? (isMine ? "Tu parte" : `Comensal ${i + 1}`)}</span>
                    <span className="ml-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                      {p.settled ? "Pagado" : "Pendiente"}
                    </span>
                  </button>
                  <span className="text-right">
                    <span className="block figure">{formatMoney(p.amountVes, "VES")}</span>
                    {!p.settled && BigInt(p.amountPaidVes) > 0n && (
                      <span className="block text-[11px] text-muted-foreground">
                        Falta {formatMoney(p.remainingVes, "VES")}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {!myParticipantRef && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Toca la parte que vas a pagar para que el pago se acredite a ella.
            </p>
          )}
        </div>
      )}

      {/* Cierra la rama de "hay algo que pagar": sin nada en la cuenta no se
          enseñan ni las formas de dividir ni el panel de pago. */}
      {!nothingToPay && (
        <GuestPaymentPanel
          bill={bill}
          demo={demo}
          tipVes={tipMinor}
          {...(myParticipant
            ? {
                splitParticipantId: myParticipant.id,
                shareRemainingVes: myParticipant.remainingVes,
              }
            : {})}
        />
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
