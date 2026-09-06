import { ChevronRight } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { formatMoney, type FloorTable } from "@/lib/api";
import { formatAge, openMinutesOf, paidPercent, toneOf } from "./tableStatus";

/**
 * Una mesa, en una fila.
 *
 * Antes cada mesa era una tarjeta con su propio bloque de cifras, libre u
 * ocupada. En un restaurante con veinte mesas y tres ocupadas, eso son
 * diecisiete tarjetas que sólo dicen «libre» y una pantalla larguísima para
 * llegar a la que importa. Ahora una mesa libre es una fila y ya está; la
 * ocupada trae lo que hace falta para decidir sin abrirla.
 */
export function TableRow({
  table,
  selected,
  onSelect,
  fallbackOpenedAt,
}: {
  table: FloorTable;
  selected: boolean;
  onSelect: () => void;
  fallbackOpenedAt?: string | undefined;
}) {
  const { t } = useI18n();
  const bill = table.openBill;
  const tone = toneOf(table);

  const pill =
    tone === "free"
      ? { text: t("tableFreeShort"), className: "bg-secondary text-muted-foreground" }
      : tone === "attention"
        ? { text: t("needsAttention"), className: "bg-amber-500/15 text-amber-700" }
        : { text: t("tableOpenShort"), className: "bg-primary/15 text-primary" };

  if (!bill) {
    return (
      <button
        data-table-card=""
        onClick={onSelect}
        aria-pressed={selected}
        className={`flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-secondary ${
          selected ? "bg-secondary" : ""
        }`}
      >
        <span className="font-display text-lg">{table.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${pill.className}`}>
          {pill.text}
        </span>
        <ChevronRight aria-hidden className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  const minutes = openMinutesOf(bill, fallbackOpenedAt);
  const percent = paidPercent(bill.amountPaidVes, bill.totalDueVes);
  const hasTotal = (() => {
    try {
      return BigInt(bill.totalDueVes || "0") > 0n;
    } catch {
      return false;
    }
  })();

  return (
    <button
      data-table-card=""
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full px-4 py-3 text-left transition-colors hover:bg-secondary ${
        selected ? "bg-secondary" : ""
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-display text-lg">{table.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${pill.className}`}>
          {pill.text}
        </span>
        <span className="money-md ml-auto">{formatMoney(bill.remainingVes, "VES")}</span>
      </div>

      {/* La referencia en dólares la calcula el servidor con la tasa congelada
          de esta cuenta (`usdReference`). No se convierte nada aquí.
          Sólo si la cuenta está en otra moneda: una cuenta en bolívares lleva
          tasa 1, así que su `usdReference` es el mismo importe en bolívares
          con un símbolo de dólar delante -- "11.200,00 Bs ≈ $11200.00". */}
      {bill.currency !== "VES" && bill.usdReference && (
        <p className="money-sm mt-0.5 text-right text-muted-foreground">≈ ${bill.usdReference}</p>
      )}

      {/* Cuánto se lleva cobrado. La barra es presentación; el importe exacto
          va escrito debajo, que es lo que alguien lee de verdad. */}
      {percent > 0 && (
        <div
          aria-hidden
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border"
          data-testid="paid-bar"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      )}

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          {bill.itemCount ?? 0} {t("lineCount")}
        </span>
        {/* Sin nada que cobrar todavía, "0,00 Bs de 0,00 Bs cobrado" no
            informa de nada y ocupa media línea. */}
        {hasTotal && (
          <>
            <span aria-hidden>·</span>
            <span className="figure">
              {t("paidOf")
                .replace("{paid}", formatMoney(bill.amountPaidVes, "VES"))
                .replace("{total}", formatMoney(bill.totalDueVes, "VES"))}
            </span>
          </>
        )}
        <span aria-hidden>·</span>
        {/* El tiempo abierto se enseña siempre; en ámbar sólo cuando la fila ya
            está marcada como "Atención", y nunca sólo por color -- la píldora
            de arriba lo dice con palabras. */}
        <span className={`figure ${tone === "attention" ? "text-amber-700" : ""}`}>
          {formatAge(minutes)}
        </span>
        {(bill.pendingClaims ?? 0) > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="text-amber-700">
              {t("claimsWaiting").replace("{n}", String(bill.pendingClaims))}
            </span>
          </>
        )}
      </p>
    </button>
  );
}
