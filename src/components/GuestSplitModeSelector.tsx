import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import type { SplitMode } from "@/lib/api";

/**
 * Cómo quiere pagar el comensal, dicho en su idioma.
 *
 * Las cuatro opciones existían como una rejilla de dos por dos con las
 * etiquetas del modelo -- «Elegir productos», «Monto personalizado» --, que son
 * nombres de implementación: describen lo que hace el servidor, no lo que va a
 * hacer quien lee. Aquí se llaman «Solo lo que consumí» y «Elegir cuánto pago»,
 * que es lo que diría alguien en una mesa.
 *
 * Una fila por opción y no una rejilla: a media pantalla los textos largos se
 * parten en dos líneas y las cuatro celdas dejan de medir igual, que es
 * exactamente la sensación de formulario que esto viene a quitar.
 *
 * Sin subtítulo bajo cada título. Los tenía, y repetían el título con otras
 * palabras -- «Pagar toda la cuenta / Cubres el saldo completo» --; lo que la
 * pantalla no puede enseñar es el importe de cada opción, y ése no se sabe sin
 * pedirle al servidor una previsualización por modo. Así que el icono y el
 * título, y nada más.
 *
 * `aria-pressed` y no un `role` inventado: son botones de verdad, con foco y
 * con el estado dicho en voz alta por el lector de pantalla. El color no es lo
 * único que marca el seleccionado -- también el borde y el fondo -- porque el
 * color solo no llega a quien no lo distingue.
 */

type Props = {
  /**
   * La opción marcada, o `null` si todavía no se ha elegido ninguna.
   *
   * Nula y no «la que haya»: el estado del reparto arranca en FULL porque
   * alguien tiene que ser el valor por defecto, y pintar «Pagar toda la
   * cuenta» como activa justo después de pulsar «Dividir la cuenta» hace
   * creer que no se registró lo que se pidió. Quién es «ninguna» lo decide
   * quien llama, que es quien sabe si ya hubo elección.
   */
  selected: SplitMode | null;
  onSelect: (mode: SplitMode) => void;
};

const ICONS: Record<SplitMode, ReactNode> = {
  FULL: (
    <>
      <path d="M3 9h18" />
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7 15h4" />
    </>
  ),
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

export function GuestSplitModeSelector({ selected, onSelect }: Props) {
  const { t } = useI18n();

  const options: { id: SplitMode; label: string }[] = [
    { id: "FULL", label: t("payAll") },
    { id: "ITEMS", label: t("splitItems") },
    { id: "EQUAL", label: t("splitEven") },
    { id: "CUSTOM", label: t("custom") },
  ];

  return (
    <div className="flex flex-col gap-2">
      {options.map((option) => {
        const isSelected = selected === option.id;
        return (
          <button
            key={option.id}
            type="button"
            data-testid={`guest-split-mode-${option.id}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(option.id)}
            /* El trazo, a `--border-strong` como la pareja de la barra: son
               cuatro opciones entre iguales y el borde es lo único que las
               dibuja. Con el borde normal contrastaban 1,23:1 contra la crema
               -- por debajo del 3:1 que piden las WCAG para el contorno de un
               control -- y sobre esta pantalla se leían como texto suelto. */
            className={`flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors ${
              isSelected
                ? "border-primary bg-primary/[0.06] text-foreground"
                : "border-border-strong bg-card text-foreground hover:bg-secondary"
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
              className="h-[22px] w-[22px] shrink-0 text-primary"
            >
              {ICONS[option.id]}
            </svg>
            <span className="text-[15px] font-medium">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
