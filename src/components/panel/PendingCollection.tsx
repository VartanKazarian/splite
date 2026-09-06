import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lo que la sala debe ahora mismo.
 *
 * Es la única cifra por la que alguien abre este panel entre dos servicios, y
 * era una casilla más en una fila de cuatro iguales. Aquí manda: ocupa su
 * propia tarjeta y su número es el más grande de la pantalla.
 *
 * La suma la hace el servidor (`openBills.outstandingVes`). El cliente no
 * suma importes: son cadenas de unidades menores que pueden pasar de 2^53, y
 * dos restas en el navegador es exactamente como una pantalla acaba
 * discrepando de la caja.
 *
 * **No hay línea en dólares.** El equivalente existe por cuenta
 * (`openBill.usdReference`, que calcula el servidor con la tasa congelada de
 * esa cuenta), pero no existe para el agregado. Convertirlo aquí con la tasa
 * de hoy daría un número que no coincide con ninguna cuenta: cada una quedó
 * congelada a la tasa del día en que se abrió. Así que la referencia en
 * dólares se enseña por mesa, donde el dato es real, y no aquí.
 */
export function PendingCollection({
  outstandingVes,
  openBills,
  loading,
}: {
  outstandingVes: string | null;
  openBills: number | null;
  loading: boolean;
}) {
  const { t } = useI18n();

  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="pending-heading">
      <h2
        id="pending-heading"
        className="text-[11px] uppercase tracking-widest text-muted-foreground"
      >
        {t("pendingCollection")}
      </h2>

      {loading || outstandingVes === null ? (
        <Skeleton className="mt-2 h-11 w-56" />
      ) : (
        <p className="money-xl mt-2">{formatMoney(outstandingVes, "VES")}</p>
      )}

      {openBills !== null && (
        <p className="mt-2 text-sm text-muted-foreground">
          {openBills === 1
            ? t("openBillsCountOne")
            : t("openBillsCount").replace("{n}", String(openBills))}
        </p>
      )}
    </section>
  );
}
