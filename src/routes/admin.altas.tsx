import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { admin, LEAD_LABEL, type Lead, type LeadStatus } from "@/lib/adminApi";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";
import { formatDateTime } from "@/lib/dates";

export const Route = createFileRoute("/admin/altas")({
  head: adminHead("Altas"),
  component: () => (
    <AdminShell current="altas">
      {(s) => <Leads canEdit={s.operator.role === "ADMIN"} />}
    </AdminShell>
  ),
});

const FILTERS: [LeadStatus | "", string][] = [
  ["NEW", "Nuevas"],
  ["CONTACTED", "Contactadas"],
  ["INVITED", "Invitadas"],
  ["ONBOARDED", "Ya clientes"],
  ["REJECTED", "Descartadas"],
  ["", "Todas"],
];

const fail = (e: unknown) =>
  toast.error(
    e instanceof ApiError && e.code === "ONBOARDING_DISABLED"
      ? "El alta por enlace está apagada en el servidor (ONBOARDING_ENABLED)."
      : e instanceof ApiError
        ? `${e.code} · ${e.message}`
        : "No se pudo conectar",
  );

/**
 * Las solicitudes de «Quiero Splite». El flujo es el de siempre: llamar,
 * marcar como contactada y, si sigue adelante, mandar el enlace de alta.
 */
function Leads({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<LeadStatus | "">("NEW");
  const q = useQuery({ queryKey: ["admin", "leads", status], queryFn: () => admin.leads(status) });
  const rows = q.data?.data ?? [];

  return (
    <>
      <h1 className="text-3xl">Altas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Restaurantes que pidieron Splite desde la página. Llama, márcala como contactada y, si
        sigue, mándale el enlace para crear su cuenta.
      </p>
      <div className="mt-6 flex flex-wrap gap-1.5">
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
      </div>
      {q.isSuccess && rows.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">Nada en esta lista.</p>
      )}
      <ul className="mt-4 space-y-3" data-testid="admin-leads">
        {rows.map((l) => (
          <LeadCard key={l.id} lead={l} canEdit={canEdit} />
        ))}
      </ul>
    </>
  );
}

function LeadCard({ lead: l, canEdit }: { lead: Lead; canEdit: boolean }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ["admin", "leads"] });
  };
  const mark = useMutation({
    mutationFn: (s: "CONTACTED" | "REJECTED") => admin.markLead(l.id, s, notes.trim() || null),
    onSuccess: (r) => done(`Marcada: ${LEAD_LABEL[r.lead.status]}`),
    onError: fail,
  });
  const invite = useMutation({
    mutationFn: () => admin.inviteLead(l.id),
    onSuccess: (r) => done(`Enlace de alta enviado a ${r.lead.email}`),
    onError: fail,
  });
  const busy = mark.isPending || invite.isPending;
  const open = l.status === "NEW" || l.status === "CONTACTED" || l.status === "INVITED";

  return (
    <li className="surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{l.restaurantName}</p>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px]">
          {LEAD_LABEL[l.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {l.email}
        {l.phone && (
          <>
            {" · "}
            <a href={`tel:${l.phone}`} className="underline underline-offset-2">
              {l.phone}
            </a>
          </>
        )}
        {" · RIF "}
        {l.rif ?? "—"}
        {l.rifChecksumOk === false && <span className="text-amber-800"> (dígito dudoso)</span>}
      </p>
      <p className="text-xs text-muted-foreground">
        Pidió el {formatDateTime(l.createdAt, "es")}
        {l.invitedAt && ` · invitada el ${formatDateTime(l.invitedAt, "es")}`}
      </p>
      {canEdit && open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota de la llamada"
            aria-label="Nota"
            className="min-h-10 min-w-[200px] flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
          {l.status === "NEW" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => mark.mutate("CONTACTED")}
              className="inline-flex min-h-10 items-center rounded-full border border-border-strong px-4 text-sm disabled:opacity-40"
            >
              Contactada
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => invite.mutate()}
            className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {l.status === "INVITED" ? "Reenviar enlace" : "Enviar enlace de alta"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => mark.mutate("REJECTED")}
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm text-muted-foreground underline underline-offset-2 disabled:opacity-40"
          >
            Descartar
          </button>
        </div>
      )}
    </li>
  );
}
