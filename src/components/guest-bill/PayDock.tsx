import { useI18n } from "@/lib/i18n";
import { formatMoney, type SplitMode } from "@/lib/api";
import "@/lib/i18n-guest";

/**
 * La barra flotante: dividir o pagar, continuar, volver.
 *
 * `sticky` y no `fixed`: esta misma pantalla vive dentro del marco de
 * teléfono de la landing, y un elemento fijo ahí dentro se ancla a la
 * ventana del navegador y se escapa del marco. Pegada al fondo del
 * contenedor que hace scroll, funciona en los dos sitios.
 */
export function PayDock({
  step,
  setStep,
  splitOpen,
  mode,
  hasPreview,
  canSplit,
  calculating,
  claimSent,
  partlyPaid,
  remainingVes,
  dockTotal,
  onOpenSplit,
}: {
  step: 1 | 2 | 3;
  setStep: (step: 1 | 2 | 3) => void;
  splitOpen: boolean;
  mode: SplitMode;
  hasPreview: boolean;
  canSplit: boolean;
  calculating: boolean;
  claimSent: boolean;
  partlyPaid: boolean;
  remainingVes: string;
  dockTotal: bigint;
  onOpenSplit: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-4 bg-gradient-to-t from-background from-65% to-transparent px-5 pb-4 pt-6">
      {/* Dividir y pagar, lado a lado y con el mismo peso: son las dos
          cosas que se puede querer hacer aquí, y antes una era un botón
          lleno y la otra un enlace dentro de la tarjeta.

          Ninguno de los dos va en verde. El verde es el color de nuestra
          llamada a la acción, y aquí no hay una: hay una bifurcación que
          decide el comensal. Pintar de verde «Pagar la cuenta» era empujar
          hacia el lado que le cuesta la cuenta entera; vuelve en el paso
          siguiente, cuando ya ha elegido y sólo queda confirmar.

          Sin color, la visibilidad la da el trazo: 1,5 px a
          `--border-strong`, que contrasta 3,2:1 contra la crema del fondo
          -- el listón de 3:1 que piden las WCAG para el contorno de un
          control -- frente al 1,23:1 del borde normal, que sobre este
          fondo no se veía. La segunda línea, apilada porque a media
          pantalla no cabe al lado, es lo que distingue una de otra: el
          importe de la cuenta entera, o sólo lo tuyo. */}
      {step === 1 && !splitOpen && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="guest-split-open"
            onClick={onOpenSplit}
            className="flex min-h-16 flex-col items-center justify-center rounded-full border-[1.5px] border-border-strong bg-card px-4 text-center transition-colors hover:bg-secondary active:bg-secondary"
          >
            <span className="text-[15px] font-medium leading-tight">{t("splitTheBill")}</span>
            <span className="text-[12px] leading-tight text-muted-foreground">
              {t("splitTheBillHint")}
            </span>
          </button>
          <button
            type="button"
            data-testid="guest-pay-full"
            onClick={() => setStep(2)}
            className="flex min-h-16 flex-col items-center justify-center rounded-full border-[1.5px] border-border-strong bg-card px-4 text-center transition-colors hover:bg-secondary active:bg-secondary"
          >
            <span className="text-[15px] font-medium leading-tight">{t("payTheBill")}</span>
            <span className="money-sm leading-tight text-muted-foreground">
              {formatMoney(dockTotal.toString(), "VES")}
            </span>
          </button>
        </div>
      )}

      {/* Dividiendo, pagar la cuenta entera deja de ofrecerse: se acaba de
          decir que no. Mientras no se elija cómo repartir no hay importe
          que confirmar, así que tampoco hay botón -- la decisión está
          arriba, en las cuatro opciones. */}
      {/* Dividiendo por productos o por importe, hasta que no hay algo
          elegido no hay parte. La barra caía entonces en lo que queda de
          la cuenta -- que es lo correcto para «Pagar toda la cuenta» y
          falso para todo lo demás -- y ofrecía «Pagar mi parte · 69.812,94
          Bs» con nada marcado: la mesa entera con la etiqueta de tu parte,
          y el botón se podía pulsar. Ahora, sin parte, el botón dice qué
          falta y no hace nada; y no va en verde, porque todavía no hay
          nada que confirmar. */}
      {step === 1 && splitOpen && mode !== "FULL" && !hasPreview && (
        <button
          type="button"
          data-testid="guest-continue-pending"
          disabled
          className="flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-full border-[1.5px] border-dashed border-border-strong px-6 text-[15px] text-muted-foreground"
        >
          {canSplit || calculating
            ? t("calculating")
            : mode === "ITEMS"
              ? t("dockPickItems")
              : t("dockEnterAmount")}
        </button>
      )}
      {step < 3 &&
        !(step === 1 && !splitOpen) &&
        !(step === 1 && mode === "FULL") &&
        !(step === 1 && !hasPreview) && (
          <button
            type="button"
            data-testid="guest-continue"
            onClick={() => setStep(step === 1 ? 2 : 3)}
            className="btn-primary w-full"
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
      {step > 1 && !claimSent && (
        <button
          type="button"
          data-testid="guest-step-back"
          onClick={() => setStep(step === 2 ? 1 : 2)}
          // Texto y no caja. Con borde pesaba lo mismo que «Continuar»
          // encima, y su borde de 1,23:1 lo hacía parecer desactivado.
          // Sigue midiendo 44 px de alto para el dedo.
          className={`min-h-11 w-full text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline ${
            step < 3 ? "mt-1" : ""
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
        <p className="hint mt-2 text-center">
          {splitOpen
            ? t("chooseHowToSplit")
            : t("overRemaining").replace("{amount}", formatMoney(remainingVes, "VES"))}
        </p>
      )}
    </div>
  );
}
