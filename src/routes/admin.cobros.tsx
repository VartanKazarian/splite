import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { formatMoney } from "@/lib/api";
import { admin, formatDay } from "@/lib/adminApi";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";
import { ChargeStatus } from "@/components/admin/ChargeStatus";

export const Route = createFileRoute("/admin/cobros")({
  head: adminHead("Cobros"),
  component: () => <AdminShell current="cobros">{() => <Charges />}</AdminShell>,
});

type Filter = "" | "OPEN" | "OVERDUE" | "PAID" | "VOID";

const FILTERS: [Filter, string][] = [
  ["OVERDUE", "Vencidos"],
  ["OPEN", "Pendientes"],
  ["PAID", "Pagados"],
  ["VOID", "Anulados"],
  ["", "Todos"],
];

/**
 * Los cargos de todos los clientes. Arranca en los vencidos: es la lista de a
 * quién escribir hoy. Los pagos se registran desde la ficha de cada cliente,
 * que es donde se ve el resto de su situación.
 */
function Charges() {
  const [status, setStatus] = useState<Filter>("OVERDUE");
  const query = useQuery({
    queryKey: ["admin", "charges", status],
    queryFn: () => admin.charges(status),
  });
  const rows = query.data?.data ?? [];
  const pending = rows
    .filter((c) => c.status === "OPEN")
    .reduce((a, c) => a + BigInt(c.remainingUsd), 0n);

  return (
    <>
      <h1 className="text-3xl">Cobros</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Lo que cada restaurante debe a Splite por periodo, en dólares de referencia. No son facturas
        fiscales.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs ${
              status === value
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {label}
          </button>
        ))}
        {pending > 0n && (
          <span className="ml-auto text-sm">
            Por cobrar en esta lista:{" "}
            <strong className="tabular-nums">{formatMoney(String(pending), "USD")}</strong>
          </span>
        )}
      </div>

      {query.isError && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          No se pudieron cargar los cobros.
        </p>
      )}
      {query.isSuccess && rows.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">Nada en esta lista.</p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm" data-testid="admin-charges-table">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-normal">Cliente</th>
                <th className="px-4 py-2.5 font-normal">Periodo</th>
                <th className="px-4 py-2.5 font-normal">Vence</th>
                <th className="px-4 py-2.5 text-right font-normal">Importe</th>
                <th className="px-4 py-2.5 text-right font-normal">Falta</th>
                <th className="px-4 py-2.5 font-normal">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link
                      to="/admin/clientes/$restaurantId"
                      params={{ restaurantId: c.restaurantId }}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {c.restaurantName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{c.tier}</span>
                  </td>
                  <td className="px-4 py-3">
                    {formatDay(c.periodStart)} → {formatDay(c.periodEnd)}
                  </td>
                  <td className="px-4 py-3">{formatDay(c.dueOn)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(c.amountUsd, "USD")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.status === "OPEN" ? formatMoney(c.remainingUsd, "USD") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ChargeStatus ch={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
