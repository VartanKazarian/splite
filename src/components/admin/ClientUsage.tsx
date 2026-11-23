import { formatMoney } from "@/lib/api";
import { REASON_LABEL, type ClientDetail } from "@/lib/adminApi";
import { formatDateTime } from "@/lib/dates";
import { HealthBadge } from "@/components/admin/HealthBadge";

/** Los métodos con que cobra el restaurante, no los de la suscripción. */
const METHOD: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  PAGO_MOVIL: "Pago Móvil",
  C2P: "C2P",
  SPLITE: "Splite",
  OTHER: "Otro",
};

const pct = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "—" : `${Math.round(bps / 100)} %`;

/** Cuánto cambió el volumen contra los 30 días anteriores, o nada si no hay con qué. */
function change(now: string, before: string): { text: string; down: boolean } | null {
  const b = BigInt(before);
  if (b === 0n) return null;
  const delta = Number(((BigInt(now) - b) * 1000n) / b) / 10;
  return { text: `${delta > 0 ? "+" : ""}${Math.round(delta)} %`, down: delta < 0 };
}

/**
 * Salud y uso del cliente en la ficha.
 *
 * Arriba la nota con todos sus motivos, que en la lista sólo cabe el primero.
 * Debajo, el mes: lo procesado, cuánto lo cobra el comensal desde el QR, el
 * día a día en barras y con qué medios. Sin librería de gráficos: treinta
 * barras se dibujan con treinta divs y no cuestan nada en el bundle del panel.
 */
export function ClientUsage({ detail }: { detail: ClientDetail }) {
  const { client: c, usage, trend } = detail;
  const a = c.activity30d;
  const vs = a ? change(a.volumeVes, a.previousVolumeVes) : null;
  const max = trend
    ? trend.daily.reduce((m, d) => (BigInt(d.volumeVes) > m ? BigInt(d.volumeVes) : m), 0n)
    : 0n;
  const totalMethods = trend ? trend.methods.reduce((s, m) => s + BigInt(m.volumeVes), 0n) : 0n;

  return (
    <>
      {c.health !== undefined && (
        <section className="surface p-5" data-testid="admin-health-section">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg">Salud</h2>
            <HealthBadge health={c.health} withReason={false} />
          </div>
          {c.health && c.health.reasons.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {c.health.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                  {REASON_LABEL[r] ?? r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {c.health ? "Nada que vigilar." : "Cliente cancelado."}
            </p>
          )}
        </section>
      )}

      <section className="surface p-5">
        <h2 className="text-lg">Uso · 30 días</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          {a && (
            <>
              <Item label="Procesado">
                <span className="tabular-nums">{formatMoney(a.volumeUsd, "USD")}</span>
                {vs && (
                  <span
                    className={`ml-1.5 text-xs ${vs.down ? "text-destructive" : "text-primary-ink"}`}
                  >
                    {vs.text}
                  </span>
                )}
              </Item>
              <Item label="Pagado desde el QR">{pct(a.guestShareBps)}</Item>
            </>
          )}
          <Item label="Cuentas atendidas">{usage.bills30d}</Item>
          <Item label="Cobrado">{formatMoney(usage.collectedVes30d, "VES")}</Item>
          {a && <Item label="Días con actividad">{a.activeDays} de 30</Item>}
          {trend && (
            <Item label="Cuenta media">
              {trend.averageBillVes ? formatMoney(trend.averageBillVes, "VES") : "—"}
            </Item>
          )}
          {trend && <Item label="Propinas">{formatMoney(trend.tipsVes, "VES")}</Item>}
          {a && (
            <Item label="Cobros fallidos o en duda">
              <span className={a.failedPayments ? "text-destructive" : undefined}>
                {a.failedPayments}
              </span>
            </Item>
          )}
          <Item label="Mesas">{usage.tables}</Item>
          <Item label="Equipo">{usage.staff}</Item>
          <Item label="Productos">{usage.products}</Item>
          <Item label="Última actividad">{formatDateTime(c.lastActivityAt, "es") ?? "Nunca"}</Item>
        </dl>

        {trend && (
          <>
            <h3 className="mt-5 text-xs text-muted-foreground">Cobrado por día</h3>
            <div
              className="mt-2 flex h-20 items-end gap-[2px]"
              role="img"
              aria-label="Cobrado por día en los últimos 30 días"
              data-testid="admin-daily"
            >
              {trend.daily.map((d) => {
                const v = BigInt(d.volumeVes);
                const h = max > 0n ? Number((v * 100n) / max) : 0;
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${formatMoney(d.volumeVes, "VES")} · ${d.bills} cuentas`}
                    className={`flex-1 rounded-sm ${v > 0n ? "bg-primary/70" : "bg-border"}`}
                    style={{ height: `${Math.max(h, 3)}%` }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>hace 30 días</span>
              <span>hoy</span>
            </div>

            {trend.methods.length > 0 && (
              <>
                <h3 className="mt-5 text-xs text-muted-foreground">Por método</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {trend.methods.map((m) => {
                    const share =
                      totalMethods > 0n
                        ? Number((BigInt(m.volumeVes) * 1000n) / totalMethods) / 10
                        : 0;
                    return (
                      <li key={m.method}>
                        <div className="flex justify-between gap-2">
                          <span>{METHOD[m.method] ?? m.method}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {Math.round(share)} % · {m.payments}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
