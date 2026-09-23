import { formatMoney, type BillItem, type MenuCurrency } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/**
 * Qué se llevó el comensal de la mesa.
 *
 * Es la interacción más delicada del reparto: de lo que se marque aquí sale lo
 * que paga, y se hace de pie, con una mano y el móvil en la otra.
 *
 * Lo que cambia respecto a la versión anterior no es el aspecto, es el tamaño.
 * Los botones de cantidad median 28 px -- por debajo de los 44 que necesita un
 * dedo --, así que restar una unidad fallaba y daba de más. Ahora miden 44, y
 * la fila entera es el área de marcado cuando sólo hay una unidad: el objetivo
 * pasa de una casilla de 16 px a toda la anchura de la pantalla.
 *
 * Los `aria-label` de + y − nombran el producto. Eran «+» y «−» a secas: con
 * ocho líneas en la cuenta, un lector de pantalla leía dieciséis botones
 * llamados igual y ninguno decía de qué.
 *
 * El precio por unidad va debajo del nombre porque es lo que hace falta para
 * decidir cuántas marcar; el importe de la derecha es lo que llevas de esa
 * línea, y cambia al tocar.
 */

type Props = {
  items: BillItem[];
  /** Unidades que el comensal se atribuye, por id de línea. */
  mine: Record<string, number>;
  currency: MenuCurrency;
  onChange: (itemId: string, qty: number, max: number) => void;
};

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors ${
        on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card"
      }`}
    >
      {on && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="m5 13 4 4L19 7" />
        </svg>
      )}
    </span>
  );
}

export function GuestItemSelector({ items, mine, currency, onChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="mt-5 space-y-2.5">
      <p className="field-label">{t("selectYourItems")}</p>

      {items.map((item) => {
        const max = item.quantity ?? 1;
        const qty = mine[item.id] ?? 0;
        const on = qty > 0;
        const lineTotal = (BigInt(item.subtotalMinor) * BigInt(qty)) / BigInt(max || 1);
        // El mismo trazo que las opciones de arriba: cada fila es algo que se
        // toca. Marcada, el verde translúcido de lo elegido.
        const frame = `rounded-2xl border-[1.5px] transition-colors ${
          on ? "border-primary bg-primary/10" : "border-border-strong bg-card"
        }`;

        // Una sola unidad: la fila entera marca y desmarca, sin contador que
        // sólo podría decir uno o cero.
        if (max === 1) {
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`guest-item-${item.id}`}
              aria-pressed={on}
              onClick={() => onChange(item.id, on ? 0 : 1, max)}
              className={`flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left ${frame}`}
            >
              <Tick on={on} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{item.name}</span>
              </span>
              <span className={`money-md shrink-0 ${on ? "" : "text-muted-foreground"}`}>
                {formatMoney(item.subtotalMinor, currency)}
              </span>
            </button>
          );
        }

        return (
          <div key={item.id} className={`px-3.5 py-3 ${frame}`}>
            <button
              type="button"
              data-testid={`guest-item-${item.id}`}
              aria-pressed={on}
              onClick={() => onChange(item.id, on ? 0 : 1, max)}
              className="flex min-h-[44px] w-full items-center gap-3 text-left"
            >
              <Tick on={on} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{item.name}</span>
                <span className="money-sm block text-muted-foreground">
                  {formatMoney(item.unitPriceMinor, currency)} {t("perUnit")}
                </span>
              </span>
              <span className={`money-md shrink-0 ${on ? "" : "text-muted-foreground"}`}>
                {formatMoney(lineTotal.toString(), currency)}
              </span>
            </button>

            <div className="mt-2 flex items-center gap-3 pl-9">
              <button
                type="button"
                data-testid={`guest-item-minus-${item.id}`}
                aria-label={`${t("removeOne")} ${item.name}`}
                onClick={() => onChange(item.id, qty - 1, max)}
                disabled={qty <= 0}
                className="h-11 w-11 rounded-full border-[1.5px] border-border-strong bg-card text-lg leading-none transition-colors hover:bg-secondary disabled:opacity-30"
              >
                −
              </button>
              <span className="figure min-w-8 text-center text-xl">{qty}</span>
              <button
                type="button"
                data-testid={`guest-item-plus-${item.id}`}
                aria-label={`${t("addOne")} ${item.name}`}
                onClick={() => onChange(item.id, qty + 1, max)}
                disabled={qty >= max}
                className="h-11 w-11 rounded-full border-[1.5px] border-border-strong bg-card text-lg leading-none transition-colors hover:bg-secondary disabled:opacity-30"
              >
                +
              </button>
              <span className="hint">{t("ofAvailable").replace("{max}", String(max))}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
