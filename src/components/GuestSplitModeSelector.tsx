import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import type { SplitMode } from "@/lib/api";

/**
 * Cómo paga el comensal su parte, una vez que dijo «Dividir la cuenta».
 *
 * Antes era una lista de cuatro filas, y la primera era «Pagar toda la
 * cuenta»: la misma opción que el botón grande de al lado de «Dividir», que el
 * comensal acababa de pasar de largo. Para marcar lo suyo hacían falta tres
 * toques -- dividir, «Solo lo que consumí», el primer plato --, con el total de
 * la cuenta ocupando la pantalla entre medias (R13).
 *
 * Ahora, al dividir se entra ya en «Lo mío» con los platos para marcar, que es
 * lo que hace casi todo el mundo en una mesa. Las otras dos formas quedan a un
 * toque en un selector de tres, y volver a pagar la cuenta entera es un enlace
 * debajo: es deshacer «Dividir», no una forma de dividir.
 *
 * `aria-pressed` y no un `role` inventado: son botones de verdad, con foco y
 * con el estado dicho en voz alta. El seleccionado se distingue por el relleno
 * y no sólo por el color.
 */

type Props = {
  /** La forma elegida. Nunca FULL: pagar la cuenta entera es `onPayWhole`. */
  selected: Exclude<SplitMode, "FULL">;
  onSelect: (mode: Exclude<SplitMode, "FULL">) => void;
  /** Deshacer «Dividir»: volver a pagar la cuenta entera. */
  onPayWhole: () => void;
};

const ICONS: Record<Exclude<SplitMode, "FULL">, ReactNode> = {
  ITEMS: (
    <>
      <path d="M7 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
      <path d="M9 13v8" />
      <path d="M17 3c-1.5 2-2 4-2 6a2 2 0 0 0 2 2h0V3z" />
      <path d="M17 11v10" />
    </>
  ),
  EQUAL: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.2 2.7-5 6-5s6 1.8 6 5" />
      <path d="M16 5.2A3.2 3.2 0 0 1 16 11" />
      <path d="M18 15.4c2 .8 3 2.3 3 4.6" />
    </>
  ),
  CUSTOM: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
};

export function GuestSplitModeSelector({ selected, onSelect, onPayWhole }: Props) {
  const { t } = useI18n();

  const options: { id: Exclude<SplitMode, "FULL">; label: string }[] = [
    { id: "ITEMS", label: t("splitTabItems") },
    { id: "EQUAL", label: t("splitTabEven") },
    { id: "CUSTOM", label: t("splitTabCustom") },
  ];

  return (
    <div>
      <p className="field-label">{t("splitHowYouPay")}</p>
      <div
        role="group"
        aria-label={t("splitHowYouPay")}
        /* El trazo a `--border-strong`, como el resto de controles de esta
           pantalla: con el borde normal el contorno no llega al 3:1 de las
           WCAG contra la crema. */
        className="mt-2 grid grid-cols-3 gap-1 rounded-full border-[1.5px] border-border-strong bg-card p-1"
      >
        {options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`guest-split-mode-${option.id}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(option.id)}
              // Una línea siempre que quepa: en un Android normal (412 px)
              // «Partes iguales» se partía en dos con el icono al lado. El
              // icono sólo aparece con sitio de sobra, y el texto baja a 13 px
              // antes de partirse; en los teléfonos más estrechos se parte.
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full px-1 text-center text-[13px] font-medium leading-tight transition-colors min-[380px]:whitespace-nowrap min-[480px]:px-2 min-[480px]:text-[14px] ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="hidden h-4 w-4 shrink-0 min-[520px]:block"
              >
                {ICONS[option.id]}
              </svg>
              {option.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        data-testid="guest-split-cancel"
        onClick={onPayWhole}
        className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {t("splitPayWholeInstead")}
      </button>
    </div>
  );
}
