import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import "@/lib/i18n-staff";

/**
 * El botón de guardar de Configuración, el mismo en todas las tarjetas.
 *
 * Cada formulario lo hacía a su manera: «Guardar», «Guardar tarifas»,
 * «Guardar el RIF», «Guardar credenciales»; unos se encendían sólo al cambiar
 * algo y otros estaban siempre encendidos, así que en la misma pantalla un
 * botón salía pálido y el de al lado fuerte sin que nada lo explicara. Y
 * ninguno decía que había cambios sin guardar.
 *
 * La regla, para todos: «Guardar», encendido sólo cuando hay un cambio y es
 * válido, y al lado «Cambios sin guardar» mientras lo haya. Las elecciones de
 * un toque (moneda, propina, aprobación de pedidos) no llevan botón: se
 * guardan al tocarlas.
 */
export function SaveRow({
  dirty,
  valid = true,
  pending,
  onSave,
  testId,
  children,
}: {
  /** Hay algo distinto de lo guardado. */
  dirty: boolean;
  /** Lo escrito se puede mandar. Con cambios pero inválido, el botón sigue apagado. */
  valid?: boolean;
  pending: boolean;
  onSave: () => void;
  testId?: string;
  /** Otros botones de la fila (Borrar…), a la derecha del de guardar. */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        data-testid={testId}
        disabled={!dirty || !valid || pending}
        onClick={onSave}
        className="min-h-11 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? t("saving") : t("save")}
      </button>
      {dirty && !pending && (
        <span role="status" className="text-xs text-muted-foreground">
          {t("unsavedChanges")}
        </span>
      )}
      {children}
    </div>
  );
}
