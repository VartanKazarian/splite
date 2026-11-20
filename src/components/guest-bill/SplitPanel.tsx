import type { Ref } from "react";

import { useI18n } from "@/lib/i18n";
import {
  formatMoney,
  TIP_OPTIONS,
  type Bill,
  type BillSplit,
  type SplitMode,
  type SplitPreview,
} from "@/lib/api";
import { GuestError } from "@/components/GuestError";
import { GuestItemSelector } from "@/components/GuestItemSelector";
import { GuestSplitModeSelector } from "@/components/GuestSplitModeSelector";
import { myShare } from "@/components/guest-bill/helpers";
import "@/lib/i18n-guest";

/**
 * La tarjeta del reparto: cómo dividir (paso 1), tu parte, la propina
 * (paso 2) y acordar el reparto.
 *
 * Sólo pinta: el estado vive en `GuestBillScreen`, que es quien lo comparte con
 * la barra de abajo y con el panel de pago.
 */
export function SplitPanel({
  panelRef,
  hidden,
  step,
  splitOpen,
  demo,
  bill,
  mode,
  onSelectMode,
  onPayWhole,
  diners,
  setDiners,
  mine,
  setMineQty,
  amount,
  setAmount,
  calculating,
  splitError,
  preview,
  tip,
  confirm,
}: {
  panelRef: Ref<HTMLDivElement>;
  hidden: boolean;
  step: 1 | 2 | 3;
  splitOpen: boolean;
  demo: boolean;
  bill: Bill;
  mode: SplitMode;
  onSelectMode: (mode: Exclude<SplitMode, "FULL">) => void;
  onPayWhole: () => void;
  diners: number;
  setDiners: (update: (n: number) => number) => void;
  mine: Record<string, number>;
  setMineQty: (itemId: string, qty: number, max: number) => void;
  amount: string;
  setAmount: (value: string) => void;
  calculating: boolean;
  splitError: unknown;
  preview: SplitPreview | null;
  tip: TipProps;
  confirm: ConfirmProps;
}) {
  const { t } = useI18n();
  return (
    <div ref={panelRef} className={`surface mt-4 p-6 ${hidden ? "hidden" : ""}`}>
      {/* Las cuatro formas de repartir, sólo una vez que se ha elegido
          dividir. Antes vivía aquí también el botón que abre esto; se
          mudó a la barra de abajo, a la misma altura que pagar, porque
          dividir es la otra mitad de para qué se abre esta pantalla y no
          una opción escondida dentro de la tarjeta. */}
      {step !== 1 || !splitOpen ? null : (
        <GuestSplitModeSelector
          // Al abrir el reparto se entra en «Lo mío» (R13); FULL aquí
          // sólo puede ser un instante antes de que eso se aplique.
          selected={mode === "FULL" ? "ITEMS" : mode}
          onSelect={onSelectMode}
          // "Pagar toda la cuenta" no es una forma de dividir: es decir
          // que no se divide. Cierra el panel y devuelve la pareja de
          // botones, en vez de dejar abierto un reparto de uno.
          onPayWhole={onPayWhole}
        />
      )}

      {step === 1 && mode === "EQUAL" && <DinersPicker diners={diners} setDiners={setDiners} />}

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
          <p className="field-label">{t("yourAmount")}</p>
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-3 min-h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-base outline-none focus:border-ring"
          />
        </div>
      )}

      {calculating && <p className="hint mt-5">{t("calculating")}</p>}

      {splitError ? <GuestError error={splitError} /> : null}

      {/* Sólo cuando hay un reparto de verdad. Pagando la cuenta entera,
          "Tu parte" era el total dicho por tercera vez en la misma
          pantalla, y presentado como una decisión ya tomada: o divides, o
          pagas todo, y eso se elige abajo. */}
      {/* En el paso 2 esto es lo primero de la tarjeta -- el selector y
          sus paneles son del paso 1 -- y su margen y su línea de arriba
          dejaban una franja blanca vacía de cien píxeles encima de «Tu
          parte», que parecía una tarjeta a medio cargar. */}
      {preview && !calculating && !(step === 1 && mode === "FULL") && (
        <div className="mt-5 border-t border-border pt-4 first:mt-0 first:border-t-0 first:pt-0">
          <ShareFigures preview={preview} mode={mode} tipMinor={tip.tipMinor} />
          {/* La propina se pregunta cuando ya hay una cifra, no a media
              pantalla y antes de que nadie se haya comprometido a pagar. */}
          <TipPicker
            {...tip}
            hidden={step !== 2}
            totalWithTip={(BigInt(myShare(preview, mode)) + BigInt(tip.tipMinor)).toString()}
          />

          {/* Sólo cuando de verdad se está dividiendo. Con "Pagar todo"
              -- que ahora es el camino por defecto y no una opción que se
              elige -- un botón llamado "Confirmar división" aparecía sin
              que nadie hubiera dividido nada. Pagar la cuenta entera no
              necesita guardar ningún reparto: lo hace el panel de pago. */}
          {step === 1 && !demo && mode !== "FULL" && <ConfirmSplit {...confirm} />}
        </div>
      )}
    </div>
  );
}

/** Con nombre y con tope. */
function DinersPicker({
  diners,
  setDiners,
}: {
  diners: number;
  setDiners: (update: (n: number) => number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-5">
      <p className="field-label">{t("howManyDiners")}</p>
      {/* Con nombre y con tope: eran «−» y «+» a secas, que un lector
          de pantalla lee como «menos» sin decir de qué, y en el mínimo
          el «−» seguía pareciendo que hacía algo. */}
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          aria-label={t("dinersFewer")}
          disabled={diners <= 2}
          onClick={() => setDiners((n) => Math.max(2, n - 1))}
          className="h-11 w-11 rounded-full border-[1.5px] border-border-strong bg-card text-lg text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          −
        </button>
        <span aria-live="polite" className="figure min-w-8 text-center text-xl">
          {diners}
        </span>
        <button
          type="button"
          aria-label={t("dinersMore")}
          disabled={diners >= 50}
          onClick={() => setDiners((n) => Math.min(50, n + 1))}
          className="h-11 w-11 rounded-full border-[1.5px] border-border-strong bg-card text-lg text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Tu parte, y lo que queda y lo repartido.
 *
 * Una cifra grande por tarjeta, y es la que se puede pagar desde ella. Sin
 * propina puesta, eso es tu parte; en cuanto hay propina, el importe con
 * propina toma el sitio y esto baja a fila normal. Había tres cifras de 30,
 * 30 y 24 px, y la pequeña era la única que se transfiere de verdad.
 */
function ShareFigures({
  preview,
  mode,
  tipMinor,
}: {
  preview: SplitPreview;
  mode: SplitMode;
  tipMinor: string;
}) {
  const { t } = useI18n();
  const label =
    mode === "EQUAL" ? t("perPerson") : mode === "FULL" ? t("theWholeBill") : t("yourShare");
  const share = myShare(preview, mode);
  return (
    <>
      {tipMinor === "0" ? (
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow">{label}</span>
          <span className="money-xl">{formatMoney(share, "VES")}</span>
        </div>
      ) : (
        <div className="flex justify-between gap-3">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="money-md">{formatMoney(share, "VES")}</span>
        </div>
      )}
      {/* Las dos filas de apoyo sólo dicen algo cuando el reparto es de
          verdad. Pagando la cuenta entera valen lo mismo que el titular,
          y la tarjeta enseñaba el mismo importe tres veces seguidas -- en
          serif arriba y en la fuente del texto justo debajo, que parecía
          un fallo de composición más que una jerarquía. */}
      {(preview.outstandingVes !== share || preview.totalAllocatedVes !== share) && (
        <>
          <div className="mt-3 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{t("outstanding")}</span>
            <span className="money-sm">{formatMoney(preview.outstandingVes, "VES")}</span>
          </div>
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{t("allocated")}</span>
            <span className="money-sm">{formatMoney(preview.totalAllocatedVes, "VES")}</span>
          </div>
        </>
      )}
    </>
  );
}

export type TipProps = {
  tipPct: number | null;
  setTipPct: (pct: number | null) => void;
  tipCustom: string;
  setTipCustom: (value: string) => void;
  /** La propina en céntimos, ya calculada sobre la parte. */
  tipMinor: string;
};

function TipPicker({
  tipPct,
  setTipPct,
  tipCustom,
  setTipCustom,
  tipMinor,
  hidden,
  totalWithTip,
}: TipProps & { hidden: boolean; totalWithTip: string }) {
  const { t } = useI18n();
  return (
    <div className={`mt-5 border-t border-border pt-4 ${hidden ? "hidden" : ""}`}>
      <p className="field-label">{t("tipTitle")}</p>
      <p className="hint mt-1">{t("tipHint")}</p>
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
        {TIP_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={tipPct === p}
            onClick={() => {
              setTipPct(p);
              setTipCustom("");
            }}
            className={`min-h-11 rounded-lg border-[1.5px] px-2 text-sm font-medium text-foreground transition-colors ${
              p === 0 ? "col-span-2" : ""
            } ${
              tipPct === p
                ? "border-primary bg-primary/10"
                : "border-border-strong bg-card hover:bg-secondary"
            }`}
          >
            {p === 0 ? t("tipNone") : `${p}%`}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={tipPct === null}
          onClick={() => setTipPct(null)}
          className={`min-h-11 rounded-lg border-[1.5px] px-2 text-sm font-medium text-foreground transition-colors ${
            tipPct === null
              ? "border-primary bg-primary/10"
              : "border-border-strong bg-card hover:bg-secondary"
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
          className="mt-3 min-h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-base outline-none focus:border-ring"
        />
      )}
      <div className="mt-3 flex justify-between gap-3 text-sm text-muted-foreground">
        <span>{t("tipAmount")}</span>
        <span className="money-md">{formatMoney(tipMinor, "VES")}</span>
      </div>
      {tipMinor !== "0" && (
        <div className="mt-3 flex flex-col gap-0.5 border-t border-border pt-3 text-foreground">
          <span className="eyebrow">{t("yourTotalWithTip")}</span>
          <span className="money-xl">{formatMoney(totalWithTip, "VES")}</span>
        </div>
      )}
    </div>
  );
}

export type ConfirmProps = {
  activeSplit: BillSplit | null;
  myName: string;
  setMyName: (name: string) => void;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
};

/**
 * Acordar el reparto (o reemplazar el que hay), con el nombre opcional.
 *
 * El nombre va aquí y no en un paso propio: es una línea opcional justo antes
 * de acordar el reparto, que es el momento en que empieza a servir para algo.
 * Sin él la lista dice «Comensal 2» y funciona igual -- el valor es para los
 * demás, que ven quién ha pagado sin preguntarlo en voz alta.
 */
function ConfirmSplit({ activeSplit, myName, setMyName, pending, error, onConfirm }: ConfirmProps) {
  const { t } = useI18n();
  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* Con un reparto ya acordado el nombre se pide abajo, sobre
          la parte que el comensal acaba de tomar. Pedirlo aquí
          también ponía dos campos «Tu nombre» en la misma pantalla,
          preguntando lo mismo dos veces. El botón de acordar o
          reemplazar se queda: ésa es otra decisión. */}
      {!activeSplit && (
        <>
          <label className="field-label block">
            {t("yourNameOptional")}
            <input
              data-testid="guest-my-name"
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              maxLength={80}
              autoComplete="given-name"
              placeholder={t("yourNamePlaceholder")}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-base font-normal outline-none focus:border-ring"
            />
          </label>
          <p className="hint mb-4 mt-1.5">{t("yourNameWhy")}</p>
        </>
      )}
      <button
        data-testid="guest-split-confirm"
        disabled={pending}
        onClick={onConfirm}
        className="btn-choice w-full"
      >
        {pending ? t("loading") : activeSplit ? t("splitReplace") : t("splitConfirm")}
      </button>
      {/* Con un reparto ya acordado, el botón reemplaza en vez de
          crear, y hay que decirlo antes de pulsarlo: por detrás el
          anterior se anula. El servidor sólo lo permite mientras
          nadie haya pagado -- en cuanto hay dinero contra una
          parte, responde y el reparto viejo se queda. */}
      <p className="hint mt-2">{activeSplit ? t("splitReplaceNote") : t("splitConfirmNote")}</p>
      {error ? <GuestError error={error} /> : null}
    </div>
  );
}
