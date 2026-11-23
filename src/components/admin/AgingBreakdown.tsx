import { formatMoney } from "@/lib/api";
import type { Metrics } from "@/lib/adminApi";

type Aging = NonNullable<Metrics["aging"]>;

/**
 * Lo que se debe, por cuánto hace que venció.
 *
 * Un cargo vencido de ayer es un recordatorio; uno de hace dos meses es una
 * conversación, y quizá una suspensión. Por eso se separan.
 */
export function AgingBreakdown({ aging }: { aging: Aging }) {
  const rows: [string, string, string][] = [
    ["Sin vencer", aging.currentUsd, "bg-primary/60"],
    ["1–30 días", aging.days1to30Usd, "bg-amber-500/70"],
    ["31–60 días", aging.days31to60Usd, "bg-orange-600/70"],
    ["Más de 60 días", aging.days61PlusUsd, "bg-destructive/80"],
  ];
  const total = rows.reduce((s, [, v]) => s + BigInt(v), 0n);
  return (
    <div data-testid="admin-aging">
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-secondary">
        {total > 0n &&
          rows.map(([label, v, tone]) => (
            <div
              key={label}
              className={tone}
              style={{ width: `${Number((BigInt(v) * 1000n) / total) / 10}%` }}
            />
          ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {rows.map(([label, v, tone]) => (
          <div key={label}>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className={`h-2 w-2 rounded-full ${tone}`} />
              {label}
            </dt>
            <dd className="mt-0.5 tabular-nums">{formatMoney(v, "USD")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
