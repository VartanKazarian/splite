import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { FloorTable } from "@/lib/api";
import { AGE_ATTENTION_MINUTES, formatAge, openMinutesOf } from "./tableStatus";

/**
 * Lo que hay que atender ahora, y nada más.
 *
 * Todo sale de datos que el panel ya tiene: avisos de pago sin verificar por
 * mesa (`pendingClaims`), cargos C2P que el banco dejó en duda, y cuentas que
 * llevan abiertas más de lo normal. No se inventa ninguna categoría ni se
 * consulta nada nuevo.
 *
 * Sin nada que atender no se dibuja una tarjeta vacía: una línea y ya. Un panel
 * que dedica el mismo espacio a "no pasa nada" que a "hay dinero esperando"
 * enseña a no mirar esa zona.
 */
export function AttentionList({
  tables,
  unresolvedC2P,
  openedAtByBill,
}: {
  tables: FloorTable[];
  unresolvedC2P: number;
  openedAtByBill: Map<string, string>;
}) {
  const { t } = useI18n();

  const items: { key: string; text: string; to: "/pagos" | "/dashboard" }[] = [];

  for (const table of tables) {
    const bill = table.openBill;
    if (!bill) continue;

    if ((bill.pendingClaims ?? 0) > 0) {
      items.push({
        key: `claims-${table.id}`,
        text: t("attentionClaims")
          .replace("{n}", String(bill.pendingClaims))
          .replace("{table}", table.name),
        to: "/pagos",
      });
    }
  }

  /* Las cuentas viejas van en una sola línea, no una por mesa.
     Una por mesa convertía esto en la lista más larga de la pantalla -- ocho
     entradas diciendo lo mismo que ya dice cada fila en su propia antigüedad --
     y una sección de avisos que ocupa más que la sala deja de leerse. */
  const old = tables.filter((table) => {
    const bill = table.openBill;
    if (!bill) return false;
    const minutes = openMinutesOf(bill, openedAtByBill.get(bill.id));
    return minutes !== null && minutes >= AGE_ATTENTION_MINUTES;
  });
  if (old.length === 1) {
    const bill = old[0]!.openBill!;
    items.push({
      key: "age",
      text: t("attentionOldBill")
        .replace("{table}", old[0]!.name)
        .replace("{age}", formatAge(openMinutesOf(bill, openedAtByBill.get(bill.id)))),
      to: "/dashboard",
    });
  } else if (old.length > 1) {
    items.push({
      key: "age",
      text: t("attentionOldBills")
        .replace("{n}", String(old.length))
        .replace("{age}", formatAge(AGE_ATTENTION_MINUTES)),
      to: "/dashboard",
    });
  }

  if (unresolvedC2P > 0) {
    items.push({
      key: "c2p",
      text: t("attentionC2P").replace("{n}", String(unresolvedC2P)),
      to: "/pagos",
    });
  }

  if (items.length === 0) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Check aria-hidden className="h-3.5 w-3.5 text-primary" /> {t("allClear")}
      </p>
    );
  }

  return (
    <section className="surface p-4" aria-labelledby="attention-heading">
      <h2
        id="attention-heading"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground"
      >
        <AlertTriangle aria-hidden className="h-3.5 w-3.5 text-amber-600" />
        {t("attentionTitle")}
      </h2>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="flex min-h-11 items-center rounded-lg px-2 text-sm transition-colors hover:bg-secondary"
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
