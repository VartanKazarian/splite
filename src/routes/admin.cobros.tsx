import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, formatMoney } from "@/lib/api";
import { admin, formatDay, METHOD_LABEL, type AdminNotice } from "@/lib/adminApi";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";
import { ChargeStatus } from "@/components/admin/ChargeStatus";

export const Route = createFileRoute("/admin/cobros")({
  head: adminHead("Cobros"),
  component: () => (
    <AdminShell current="cobros">
      {(s) => <Charges canEdit={s.operator.role === "ADMIN"} />}
    </AdminShell>
  ),
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
function Charges({ canEdit }: { canEdit: boolean }) {
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

      <Notices canEdit={canEdit} />

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

/**
 * Los «Ya pagué» de los restaurantes, arriba de todo: cada uno es alguien
 * esperando a que le digamos que su pago llegó. Confirmar registra el pago;
 * rechazar le enseña el motivo al restaurante.
 */
function Notices({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({ queryKey: ["admin", "notices"], queryFn: () => admin.notices("PENDING") });
  const rows = q.data?.data ?? [];
  if (!rows.length) return null;
  return (
    <section className="surface mt-6 p-5" data-testid="admin-notices">
      <h2 className="text-lg">Avisos de pago por confirmar</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Búscalo en el banco de Splite antes de confirmar. En bolívares, si no escribes la tasa se
        usa la del BCV de hoy.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((n) => (
          <NoticeRow key={n.id} n={n} canEdit={canEdit} />
        ))}
      </ul>
    </section>
  );
}

function NoticeRow({ n, canEdit }: { n: AdminNotice; canEdit: boolean }) {
  const qc = useQueryClient();
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin"] });
  const fail = (e: unknown) =>
    toast.error(e instanceof ApiError ? `${e.code} · ${e.message}` : "No se pudo conectar");
  const rateText = rate
    .trim()
    .replace(/\./g, (m, _i, str: string) => (str.includes(",") ? "" : m))
    .replace(",", ".");
  const confirm = useMutation({
    mutationFn: () =>
      admin.confirmNotice(n.id, { fxRate: n.currency === "VES" && rateText ? rateText : null }),
    onSuccess: (r) => {
      toast.success(
        r.charge?.status === "PAID"
          ? `Confirmado. El cargo de ${n.restaurantName} quedó pagado.`
          : `Confirmado: ${formatMoney(r.payment.appliedUsd, "USD")}`,
      );
      refresh();
    },
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => admin.rejectNotice(n.id, reason.trim()),
    onSuccess: () => {
      toast.success("Aviso rechazado");
      refresh();
    },
    onError: fail,
  });

  return (
    <li className="py-3 text-sm" data-testid={`admin-notice-${n.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <Link
            to="/admin/clientes/$restaurantId"
            params={{ restaurantId: n.restaurantId }}
            className="font-medium hover:text-primary hover:underline"
          >
            {n.restaurantName}
          </Link>
          <span className="text-muted-foreground">
            {" "}
            · {METHOD_LABEL[n.method]} · {formatDay(n.paidOn)}
            {n.reference ? ` · ref ${n.reference}` : ""}
          </span>
        </span>
        <strong className="tabular-nums">{formatMoney(n.amount, n.currency)}</strong>
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {n.currency === "VES" && (
            <input
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Tasa Bs/$ (vacío = BCV hoy)"
              aria-label="Tasa"
              className="min-h-10 w-56 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
            />
          )}
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
            className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
            data-testid="admin-notice-confirm"
          >
            Llegó: confirmar
          </button>
          {rejecting ? (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo (lo ve el restaurante)"
                aria-label="Motivo"
                className="min-h-10 min-w-[200px] flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              />
              <button
                type="button"
                disabled={reject.isPending || reason.trim().length < 3}
                onClick={() => reject.mutate()}
                className="inline-flex min-h-10 items-center rounded-full border border-destructive/60 px-4 text-sm text-destructive disabled:opacity-40"
              >
                Rechazar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              No aparece
            </button>
          )}
        </div>
      )}
    </li>
  );
}
