import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";

import { formatMoney } from "@/lib/api";
import {
  admin,
  CYCLE_LABEL,
  STATE_LABEL,
  type AdminClient,
  type ClientState,
} from "@/lib/adminApi";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";
import { StateBadge } from "@/components/admin/StateBadge";
import { formatDateTime } from "@/lib/dates";

export const Route = createFileRoute("/admin/")({
  head: adminHead("Clientes"),
  component: () => <AdminShell current="clientes">{() => <Clients />}</AdminShell>,
});

const FILTERS: ["" | ClientState, string][] = [
  ["", "Todos"],
  ["OVERDUE", STATE_LABEL.OVERDUE],
  ["TRIAL", STATE_LABEL.TRIAL],
  ["TRIAL_EXPIRED", STATE_LABEL.TRIAL_EXPIRED],
  ["ACTIVE", STATE_LABEL.ACTIVE],
  ["SUSPENDED", STATE_LABEL.SUSPENDED],
  ["CANCELLED", STATE_LABEL.CANCELLED],
];

const usd = (cents: string | null) => (cents === null ? "—" : formatMoney(cents, "USD"));

/** Hace cuánto: la pregunta es «¿lo sigue usando?», no la hora exacta. */
function since(iso: string | null): string {
  if (!iso) return "Nunca";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  return formatDateTime(iso, "es") ?? "—";
}

function Clients() {
  const [state, setState] = useState<"" | ClientState>("");
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["admin", "clients", q, state],
    queryFn: () => admin.clients({ q: q.trim() || undefined, state }),
  });
  const summary = query.data?.summary;
  const byState = summary?.byState ?? {};

  return (
    <>
      <h1 className="text-3xl">Clientes</h1>

      {/* Lo que se mira primero: cuánto entra, cuánto falta y a quién llamar. */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-summary">
        {[
          ["Ingresos recurrentes / mes", summary ? usd(summary.monthlyRecurringUsd) : "…"],
          ["Por cobrar", summary ? usd(summary.outstandingUsd) : "…"],
          ["Con deuda vencida", summary ? String(byState.OVERDUE ?? 0) : "…"],
          [
            "En prueba",
            summary ? `${byState.TRIAL ?? 0} · ${byState.TRIAL_EXPIRED ?? 0} vencidas` : "…",
          ],
        ].map(([label, value]) => (
          <div key={label} className="surface p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, RIF o correo"
            aria-label="Buscar cliente"
            className="min-h-11 w-full rounded-full border border-input bg-background pl-9 pr-4 text-sm outline-none focus:border-ring"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setState(value)}
              aria-pressed={state === value}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs ${
                state === value
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary"
              }`}
            >
              {label}
              {value && byState[value] ? (
                <span className="ml-1.5 tabular-nums">{byState[value]}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {query.isError && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          No se pudo cargar la lista.
        </p>
      )}
      {query.isSuccess && query.data.data.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">Ningún cliente con ese filtro.</p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm" data-testid="admin-clients">
          <thead className="hidden bg-secondary text-left text-xs text-muted-foreground md:table-header-group">
            <tr>
              <th className="px-4 py-2.5 font-normal">Restaurante</th>
              <th className="px-4 py-2.5 font-normal">Plan</th>
              <th className="px-4 py-2.5 font-normal">Situación</th>
              <th className="px-4 py-2.5 text-right font-normal">Precio</th>
              <th className="px-4 py-2.5 text-right font-normal">Debe</th>
              <th className="px-4 py-2.5 font-normal">Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.data ?? []).map((c) => (
              <ClientRow key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ClientRow({ c }: { c: AdminClient }) {
  const debt = BigInt(c.balanceUsd) > 0n;
  return (
    <tr className="grid grid-cols-2 gap-1 border-t border-border px-4 py-3 first:border-t-0 md:table-row md:px-0 md:py-0">
      <td className="col-span-2 md:px-4 md:py-3">
        <Link
          to="/admin/clientes/$restaurantId"
          params={{ restaurantId: c.id }}
          className="font-medium hover:text-primary hover:underline"
          data-testid={`admin-client-${c.id}`}
        >
          {c.name}
        </Link>
        <p className="text-xs text-muted-foreground">{c.ownerEmail ?? "sin dueño activo"}</p>
      </td>
      <td className="md:px-4 md:py-3">
        {c.tier}
        {c.tier !== "TRIAL" && (
          <span className="text-xs text-muted-foreground"> · {CYCLE_LABEL[c.billingCycle]}</span>
        )}
      </td>
      <td className="md:px-4 md:py-3">
        <StateBadge state={c.state} />
      </td>
      <td className="tabular-nums md:px-4 md:py-3 md:text-right">
        {usd(c.priceUsd)}
        {c.customPriceUsd && (
          <span className="ml-1 text-[10px] text-muted-foreground">pactado</span>
        )}
      </td>
      <td
        className={`tabular-nums md:px-4 md:py-3 md:text-right ${debt ? "font-medium text-destructive" : "text-muted-foreground"}`}
      >
        {debt ? usd(c.balanceUsd) : "—"}
      </td>
      <td className="col-span-2 text-xs text-muted-foreground md:col-span-1 md:px-4 md:py-3">
        {since(c.lastActivityAt)}
      </td>
    </tr>
  );
}
