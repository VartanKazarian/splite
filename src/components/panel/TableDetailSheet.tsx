import { useState } from "react";

import { useI18n } from "@/lib/i18n";
import { type FloorTable } from "@/lib/api";
import { TableDetail } from "@/components/panel/TableDetail";
import { TableQrDialog } from "@/components/panel/TableQrDialog";
import { StatusPill } from "@/components/shell/StatusPill";
import { useTableBadge } from "@/components/panel/tableStatus";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * La mesa elegida, encima de la lista y no dentro de ella.
 *
 * El detalle se abría en línea, empujando las mesas de abajo. Medido en un
 * teléfono de 393 px con la sexta mesa de diez abierta: la página pasaba a
 * 1.797 px y el detalle -- 723 de ellos -- **empezaba en y=857**. Es decir,
 * tocabas una mesa y lo que abrías quedaba por debajo del pliegue, detrás de
 * la cabecera, el buscador, los filtros y las cuatro mesas ocupadas que ya
 * habías pasado. Y empeora con el servicio: una fila libre mide 54 px y una
 * ocupada unos 100, así que cuanto más lleno el comedor, más lejos cae.
 *
 * Encima de la lista, empieza arriba siempre. La lista se queda debajo y sigue
 * siendo la navegación -- el recorrido real de un mesero es de mesa a mesa, y
 * un desplegable de treinta nombres sin estado dice menos que las filas, que
 * llevan estado, antigüedad e importe.
 *
 * A pantalla completa en el móvil y como diálogo centrado desde `sm`: el mismo
 * componente sirve para las dos, sin una segunda rama de render que mantener.
 *
 * También es el sitio del QR, que en el panel vivía siempre abierto en la
 * columna de la derecha -- 529 px de los 2.335 de la pantalla en un móvil,
 * para un código que se imprime una vez y se pega a una mesa.
 */
export function TableDetailSheet({
  table,
  open,
  onOpenChange,
  onDeleted,
}: {
  table: FloorTable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { t } = useI18n();
  const [qrOpen, setQrOpen] = useState(false);

  // La misma píldora que la fila de la lista, palabra por palabra: quien abre
  // una mesa acaba de leer "1 sin verificar" y tiene que encontrarse eso mismo
  // dentro, no un "Atención" que ya no dice cuál de los dos motivos era.
  const badge = useTableBadge(table);

  if (!table) return null;
  const pill = {
    tone:
      badge.tone === "free"
        ? ("neutral" as const)
        : badge.tone === "attention"
          ? ("attention" as const)
          : ("good" as const),
    text: badge.text,
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 max-sm:h-full max-sm:max-h-full max-sm:rounded-none max-sm:border-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
              <span className="font-display">{table.name}</span>
              <StatusPill tone={pill.tone}>{pill.text}</StatusPill>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TableDetail
              table={table}
              onDeleted={() => {
                onOpenChange(false);
                onDeleted?.();
              }}
            />

            {/* El código, a un toque y no siempre abierto. */}
            <button
              onClick={() => setQrOpen(true)}
              className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs transition-colors hover:bg-secondary"
            >
              {t("qrOfTable")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <TableQrDialog table={table} open={qrOpen} onOpenChange={setQrOpen} />
    </>
  );
}
