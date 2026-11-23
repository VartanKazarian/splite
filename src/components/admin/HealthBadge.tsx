import { HEALTH_LABEL, HEALTH_TONE, REASON_LABEL, type ClientHealth } from "@/lib/adminApi";

/**
 * La nota de salud de un cliente: nivel y número, y debajo el primer motivo.
 *
 * El motivo va escrito porque es lo que dice qué hacer -- «14 días sin abrir
 * cuentas» es una llamada --; el resto queda en el `title` y en la ficha.
 */
export function HealthBadge({
  health,
  withReason = true,
}: {
  health: ClientHealth | null | undefined;
  withReason?: boolean;
}) {
  if (!health) return <span className="text-xs text-muted-foreground">—</span>;
  const reasons = health.reasons.map((r) => REASON_LABEL[r] ?? r);
  return (
    <span className="inline-flex flex-col gap-0.5" title={reasons.join(" · ") || undefined}>
      <span
        className={`inline-flex w-fit whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] ${HEALTH_TONE[health.level]}`}
        data-testid="admin-health"
      >
        {HEALTH_LABEL[health.level]} <span className="ml-1 tabular-nums">{health.score}</span>
      </span>
      {withReason && reasons[0] && (
        <span className="text-[11px] leading-tight text-muted-foreground">
          {reasons[0]}
          {reasons.length > 1 && ` y ${reasons.length - 1} más`}
        </span>
      )}
    </span>
  );
}
