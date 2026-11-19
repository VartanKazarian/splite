import { useI18n } from "@/lib/i18n";
import { ApiError } from "@/lib/api";
import { staffErrorReference, staffErrorText } from "@/lib/staff-errors";
import "@/lib/i18n-errors";

/**
 * Un error al cargar, dentro de una tarjeta del panel.
 *
 * Enseñaba el código de la API en grande, el mensaje del backend en inglés,
 * los nombres internos de los campos y el id completo de la petición. Ahora la
 * frase del error en el idioma del panel (ver `lib/staff-errors.ts`) y, en
 * pequeño, el código y el principio del id: lo que pide soporte, nada más.
 */
export function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useI18n();
  const reference = staffErrorReference(error, t);
  return (
    <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
      <p className="text-sm text-destructive">
        {error instanceof ApiError ? staffErrorText(error, t) : fallback}
      </p>
      {reference && <p className="mt-1 text-[11px] text-muted-foreground">{reference}</p>}
    </div>
  );
}
