import { useI18n } from "@/lib/i18n";
import type { FloorTable } from "@/lib/api";
import { toneOf } from "./tableStatus";

export type FloorFilter = "ALL" | "BUSY" | "FREE" | "ALERT";

/**
 * Si una mesa entra en un filtro.
 *
 * Vive junto a las fichas y no dentro de cada ruta porque el recuento de la
 * ficha y la lista que sale al pulsarla tienen que salir de la misma regla. El
 * panel y la pantalla de mesas tenían cada uno la suya, escritas a mano y por
 * separado, que es como una ficha acaba diciendo "Libre (6)" y enseñando
 * cinco.
 */
export function matchesFilter(table: FloorTable, filter: FloorFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "BUSY") return Boolean(table.openBill);
  if (filter === "FREE") return !table.openBill;
  return toneOf(table) === "attention";
}

/**
 * Las fichas que filtran el plano.
 *
 * Estaban duplicadas en el panel y en la pantalla de mesas, con la misma
 * función y dos estilos distintos: la activa era gris en una y verde en la
 * otra. Aquí es una sola.
 *
 * **La ficha de alertas sólo existe cuando hay alguna.** Una ficha permanente
 * que dice "Alertas (0)" es una casilla para un cero -- la misma razón por la
 * que "C2P sin resolver: 0" salió del panel -- y encima empuja a las otras
 * tres hacia el borde en un teléfono estrecho justo cuando no hace falta.
 * Cuando aparece va la última, para que las tres de siempre no se muevan de
 * sitio, y se lleva el ámbar consigo: es la única ficha que enciende un color.
 *
 * Si el filtro activo era el de alertas y se resuelve la última, la ficha se
 * iría dejando una lista vacía sin explicación; el `useEffect` del que llama
 * devuelve el filtro a "todas". Se hace fuera porque el estado es suyo.
 */
export function FloorFilters({
  value,
  onChange,
  tables,
}: {
  value: FloorFilter;
  onChange: (filter: FloorFilter) => void;
  tables: FloorTable[];
}) {
  const { t } = useI18n();

  const busy = tables.filter((tb) => tb.openBill).length;
  const alerts = tables.filter((tb) => toneOf(tb) === "attention").length;

  const chips: { value: FloorFilter; label: string; count: number; alert?: boolean }[] = [
    { value: "ALL", label: t("seeAll"), count: tables.length },
    { value: "BUSY", label: t("tableOpenShort"), count: busy },
    { value: "FREE", label: t("tableFreeShort"), count: tables.length - busy },
  ];
  if (alerts > 0) {
    chips.push({ value: "ALERT", label: t("kpiAlerts"), count: alerts, alert: true });
  }

  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => {
        const on = value === chip.value;
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(chip.value)}
            aria-pressed={on}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-3 text-xs transition-colors ${
              on
                ? chip.alert
                  ? "bg-amber-500/15 font-medium text-amber-700"
                  : "bg-primary/10 font-medium text-primary"
                : `hover:bg-secondary ${chip.alert ? "text-amber-700" : "text-muted-foreground"}`
            }`}
          >
            {chip.label} ({chip.count})
          </button>
        );
      })}
    </div>
  );
}
