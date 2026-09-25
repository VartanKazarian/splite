import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { formatMoney } from "@/lib/api";
import { admin, STATE_LABEL, type ClientState } from "@/lib/adminApi";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";

export const Route = createFileRoute("/admin/resumen")({
  head: adminHead("Resumen"),
  component: () => <AdminShell current="resumen">{() => <Summary />}</AdminShell>,
});

const usd = (c: string) => formatMoney(c, "USD");

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

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[520px] text-sm" data-testid="admin-months">
          <thead className="bg-secondary text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-normal">Mes</th>
              <th className="px-4 py-2.5 text-right font-normal">Clientes nuevos</th>
              <th className="px-4 py-2.5 text-right font-normal">Facturado</th>
              <th className="px-4 py-2.5 text-right font-normal">Cobrado</th>
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
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Facturado: cargos del mes por fecha de inicio del periodo. Cobrado: pagos recibidos en el
        mes, en dólares de referencia.
      </p>
    </>
  );
}
