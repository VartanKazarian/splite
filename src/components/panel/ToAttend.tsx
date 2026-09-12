import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { FloorTable } from "@/lib/api";
import { AGE_ATTENTION_MINUTES, formatAge, openMinutesOf } from "./tableStatus";

/**
 * Lo único que le pide algo a una persona ahora mismo.
 *
 * Sustituye a tres sitios que contaban cosas que se solapaban y no coincidían
 * entre sí:
 *
 *   - La tarjeta "AVISOS", que sumaba tres tipos distintos y enlazaba a Pagos.
 *     Dos de esos tipos -- los pedidos -- no están en Pagos, están en la
 *     bandeja de esta misma pantalla, así que con dos pedidos y un aviso decía
 *     "3 · Verificar" y llevaba a una pantalla con uno. Y sin nada pendiente
 *     se quedaba ocupando una fila entera para enseñar un cero.
 *   - La lista "Atención" del final del panel, que decía casi lo mismo pero por
 *     mesa, y en un teléfono caía por debajo de todo lo demás.
 *   - El contador de la barra de arriba, que cuenta sólo los avisos de pago.
 *     Ése se queda: es más estrecho y va con su propia parada.
 *
 * **Una línea por tipo, y cada una lleva a donde se atiende ese tipo.** Es la
 * regla que rompía la tarjeta: un recuento que suma cosas que se resuelven en
 * sitios distintos no puede tener un solo destino.
 *
 * **Sin nada pendiente no se dibuja nada.** No hay "todo al día": un panel que
 * dedica el mismo sitio a "no pasa nada" que a "hay dinero esperando" enseña a
 * no mirar esa zona, y entonces tampoco se mira el día que sí pasa algo.
 */
export function ToAttend({
  orders,
  tables,
  unresolvedC2P,
  openedAtByBill,
  onOrders,
}: {
  /** Pedidos que la sala no ha dado por vistos. */
  orders: number;
  tables: FloorTable[];
  unresolvedC2P: number;
  openedAtByBill: Map<string, string>;
  /** Baja a la bandeja de pedidos, que está en esta misma pantalla. */
  onOrders: () => void;
}) {
  const { t } = useI18n();

  /** Dónde se atiende cada tipo. Tres son otra pantalla; una, un gesto de ésta. */
  type Where = "orders" | "payments" | "tables";
  const rows: { key: string; text: string; cta: string; action: Where }[] = [];

  // Los pedidos primero: son lo más reciente y lo único con un plato esperando
  // al otro lado. Un aviso de pago sin verificar aguanta cinco minutos; una
  // comanda que nadie ha visto, no.
  if (orders > 0) {
    rows.push({
      key: "orders",
      text:
        orders === 1
          ? t("attentionOrdersOne")
          : t("attentionOrders").replace("{n}", String(orders)),
      cta: t("attentionGoTray"),
      action: "orders",
    });
  }

  // Los avisos de pago, sumados. Con uno solo se dice de qué mesa, que es el
  // dato que hace falta para buscarlo en la app del banco; con varios, el
  // nombre de una de ellas sobra y la cifra es lo que importa.
  const withClaims = tables.filter((table) => (table.openBill?.pendingClaims ?? 0) > 0);
  const claims = withClaims.reduce((sum, table) => sum + (table.openBill?.pendingClaims ?? 0), 0);
  if (claims > 0) {
    rows.push({
      key: "claims",
      text:
        claims === 1 && withClaims[0]
          ? t("attentionClaimsOne").replace("{table}", withClaims[0].name)
          : t("attentionClaims").replace("{n}", String(claims)),
      cta: t("attentionGoPayments"),
      action: "payments",
    });
  }

  if (unresolvedC2P > 0) {
    rows.push({
      key: "c2p",
      text: t("attentionC2P").replace("{n}", String(unresolvedC2P)),
      cta: t("attentionGoPayments"),
      action: "payments",
    });
  }

  /*
   * Las cuentas viejas, en una sola línea y no una por mesa. Una por mesa
   * convertía esto en la lista más larga de la pantalla -- ocho entradas
   * diciendo lo que ya dice cada fila con su propia antigüedad --, y una
   * sección de avisos que ocupa más que la sala deja de leerse.
   */
  const old = tables.filter((table) => {
    const bill = table.openBill;
    if (!bill) return false;
    const minutes = openMinutesOf(bill, openedAtByBill.get(bill.id));
    return minutes !== null && minutes >= AGE_ATTENTION_MINUTES;
  });
  if (old.length > 0) {
    const first = old[0]!;
    rows.push({
      key: "age",
      text:
        old.length === 1
          ? t("attentionOldBill")
              .replace("{table}", first.name)
              .replace(
                "{age}",
                formatAge(openMinutesOf(first.openBill!, openedAtByBill.get(first.openBill!.id))),
              )
          : t("attentionOldBills")
              .replace("{n}", String(old.length))
              .replace("{age}", formatAge(AGE_ATTENTION_MINUTES)),
      /*
       * A la sala, no a una cuenta.
       *
       * Esta línea abría *una* cuenta -- la más antigua -- diciendo "3 cuentas
       * llevan más de 12 h abiertas". Con tres mesas viejas, cuál de ellas se
       * abría era una decisión del panel y no de quien mira, y las otras dos
       * desaparecían del camino. El aviso nombra un grupo; el destino tiene
       * que ser ese grupo.
       */
      cta: t("attentionGoTables"),
      action: "tables",
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="surface overflow-hidden border-amber-500/40" aria-labelledby="to-attend">
      <h2
        id="to-attend"
        className="flex items-center gap-2 border-b border-border px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground"
      >
        <AlertTriangle aria-hidden className="h-3.5 w-3.5 text-amber-600" />
        {t("attentionTitle")}
      </h2>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const inner = (
            <>
              <span className="min-w-0 text-sm">{row.text}</span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-sm text-primary">
                {row.cta}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </span>
            </>
          );
          const className =
            "flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-secondary";

          return (
            <li key={row.key}>
              {row.action === "payments" ? (
                <Link to="/pagos" className={className}>
                  {inner}
                </Link>
              ) : row.action === "tables" ? (
                // Filtrada a las que tienen cuenta abierta: son de las que
                // habla el aviso, y llegar a la lista entera obliga a volver a
                // filtrar a mano lo que el panel acaba de señalar.
                <Link to="/mesas" search={{ filtro: "BUSY" as const }} className={className}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={onOrders} className={className}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
