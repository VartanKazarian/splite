import { useI18n } from "@/lib/i18n";

/**
 * No se pudo cargar esto.
 *
 * Deliberadamente sin el código del error ni el identificador de la petición.
 * Es el mismo criterio que ya se aplicó en las pantallas del comensal y en la
 * tarjeta de propinas: a quien está de pie en un comedor no le sirve un
 * `RATE_LIMITED`, y el identificador sigue en la respuesta y en los registros,
 * que es donde alguien puede usarlo.
 *
 * `onRetry` es el `refetch` que ya tiene la consulta. No se inventa reintento
 * ninguno: si no hay a qué llamar, no sale el botón.
 */
export function LoadFailed({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="surface p-4">
      <p className="text-sm">{message ?? t("tablesCouldNotLoad")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("tryAgain")}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}
