import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { formatMoney } from "@/lib/api";
import {
  admin,
  HEALTH_LABEL,
  HEALTH_TONE,
  STATE_LABEL,
  type ClientState,
  type HealthLevel,
} from "@/lib/adminApi";
import { AgingBreakdown } from "@/components/admin/AgingBreakdown";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";

export const Route = createFileRoute("/admin/resumen")({
  head: adminHead("Resumen"),
  component: () => <AdminShell current="resumen">{() => <Summary />}</AdminShell>,
});

const usd = (c: string) => formatMoney(c, "USD");
const share = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "—" : `${Math.round(bps / 100)} %`;

/** «+12 %» contra el periodo anterior, o nada si antes no había nada. */
function versus(now: string, before: string): string {
  const b = BigInt(before);
  if (b === 0n) return "";
  const d = Number(((BigInt(now) - b) * 1000n) / b) / 10;
  return ` · ${d > 0 ? "+" : ""}${Math.round(d)} %`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const text = new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("es-VE", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  // Sólo la primera letra: `capitalize` en CSS ponía «Septiembre De 2026».
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Cómo va el negocio en una pantalla: lo que entra cada mes, lo que falta por
 * cobrar, cuántas pruebas acaban pagando y cuántos se van.
 */
function Summary() {
  const q = useQuery({ queryKey: ["admin", "metrics"], queryFn: () => admin.metrics() });
  if (q.isError) return <p className="text-sm text-destructive">No se pudo cargar el resumen.</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  const m = q.data;
  const conv = m.trialConversion;
  const pct = conv.rateBps === null ? "—" : `${(conv.rateBps / 100).toFixed(0)} %`;

  return (
    <>
      <h1 className="text-3xl">Resumen</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3" data-testid="admin-metrics">
        {[
          ["Ingresos recurrentes / mes", usd(m.monthlyRecurringUsd)],
          ["Por cobrar", usd(m.outstandingUsd)],
          ["Clientes", String(m.totalClients)],
          ["De prueba a cliente (180 días)", `${pct} · ${conv.paying} de ${conv.started}`],
          ["Cancelaciones (30 días)", String(m.cancelledLast30Days)],
          ["Avisos de pago pendientes", String(m.pendingNotices)],
          ...(m.processed30d
            ? [
                [
                  "Procesado por Splite (30 días)",
                  `${usd(m.processed30d.volumeUsd)}${versus(m.processed30d.volumeUsd, m.processed30d.previousVolumeUsd)}`,
                ],
                ["Pagado desde el QR (30 días)", share(m.processed30d.guestShareBps)],
                [
                  "Ingreso medio por cliente / mes",
                  m.averageRevenueUsd
                    ? `${usd(m.averageRevenueUsd)} · ${m.payingClients} pagan`
                    : "—",
                ],
              ]
            : []),
        ].map(([label, value]) => (
          <div key={label} className="surface p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {m.pendingNotices > 0 && (
        <p className="mt-3 text-sm">
          <Link to="/admin/cobros" className="text-primary underline underline-offset-2">
            Revisar los avisos de pago
          </Link>
        </p>
      )}

      <section className="surface mt-6 p-5">
        <h2 className="text-lg">Clientes por situación</h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {(Object.keys(STATE_LABEL) as ClientState[]).map((s) => (
            <li key={s} className="rounded-full border border-border px-3 py-1">
              {STATE_LABEL[s]} <strong className="ml-1 tabular-nums">{m.byState[s] ?? 0}</strong>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {m.byHealth && (
          <section className="surface p-5" data-testid="admin-health-summary">
            <h2 className="text-lg">Salud de los clientes</h2>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {(Object.keys(HEALTH_LABEL) as HealthLevel[]).map((h) => (
                <li key={h} className={`rounded-full border px-3 py-1 ${HEALTH_TONE[h]}`}>
                  {HEALTH_LABEL[h]}{" "}
                  <strong className="ml-1 tabular-nums">{m.byHealth?.[h] ?? 0}</strong>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link
                to="/admin"
                hash="atencion"
                className="text-primary underline underline-offset-2"
              >
                Ver quién necesita atención
              </Link>
            </p>
          </section>
        )}

        {m.aging && (
          <section className="surface p-5">
            <h2 className="text-lg">Deuda por antigüedad</h2>
            <AgingBreakdown aging={m.aging} />
          </section>
        )}
      </div>

      {m.funnel && <Funnel funnel={m.funnel} />}

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm" data-testid="admin-months">
          <thead className="bg-secondary text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-normal">Mes</th>
              <th className="px-4 py-2.5 text-right font-normal">Clientes nuevos</th>
              <th className="px-4 py-2.5 text-right font-normal">Facturado</th>
              <th className="px-4 py-2.5 text-right font-normal">Cobrado</th>
              <th className="px-4 py-2.5 text-right font-normal">Procesado</th>
              <th className="px-4 py-2.5 text-right font-normal">Restaurantes activos</th>
              <th className="px-4 py-2.5 text-right font-normal">Desde el QR</th>
            </tr>
          </thead>
          <tbody>
            {m.months
              .slice()
              .reverse()
              .map((row) => (
                <tr key={row.month} className="border-t border-border">
                  <td className="px-4 py-2.5">{monthLabel(row.month)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.newClients}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{usd(row.chargedUsd)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{usd(row.collectedUsd)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.processedUsd === undefined ? "—" : usd(row.processedUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.activeRestaurants ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {share(row.guestShareBps)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Facturado: cargos del mes por fecha de inicio del periodo. Cobrado: pagos recibidos en el
        mes, en dólares de referencia. Procesado: lo que los comensales pagaron a los restaurantes a
        través de Splite, cada cobro a la tasa de su cuenta. Restaurantes activos: los que cobraron
        algo en el mes.
      </p>
    </>
  );
}

type FunnelData = NonNullable<import("@/lib/adminApi").Metrics["funnel"]>;

/**
 * Hasta dónde llega cada restaurante que se da de alta.
 *
 * Cada paso contra el total, no contra el anterior: «la mitad nunca abre una
 * cuenta» se lee de un vistazo, y ese es el escalón donde se pierden.
 */
function Funnel({ funnel: f }: { funnel: FunnelData }) {
  const steps: [string, number][] = [
    ["Se dieron de alta", f.signedUp],
    ["Mesas y carta listas", f.setUp],
    ["Abrieron una cuenta", f.firstBill],
    ["Primer pago desde el QR", f.firstQrPayment],
    ["Pagan un plan", f.paying],
  ];
  return (
    <section className="surface mt-6 p-5" data-testid="admin-funnel">
      <h2 className="text-lg">Embudo de alta · {f.windowDays} días</h2>
      <ul className="mt-4 space-y-3 text-sm">
        {steps.map(([label, n]) => {
          const p = f.signedUp ? (n * 100) / f.signedUp : 0;
          return (
            <li key={label}>
              <div className="flex justify-between gap-2">
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {n} · {Math.round(p)} %
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${p}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
