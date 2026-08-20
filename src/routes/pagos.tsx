import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  formatMoney,
  payments,
  staffSession,
  type C2PResolution,
  type C2PUnresolvedCharge,
  type StaffPaymentClaim,
} from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

export const Route = createFileRoute("/pagos")({
  head: () => ({
    meta: [
      { title: "Verificación de pagos — Splite" },
      {
        name: "description",
        content:
          "Avisos de pago móvil por verificar y cargos C2P sin resolver del restaurante.",
      },
      { property: "og:title", content: "Verificación de pagos — Splite" },
      { property: "og:description", content: "Confirma o rechaza pagos declarados por los comensales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!staffSession.get()) navigate({ to: "/login" });
    else setReady(true);
  }, [navigate]);

  const claimsQuery = useQuery({
    queryKey: ["payment-claims"],
    queryFn: () => payments.claims("PENDING"),
    enabled: ready,
    retry: false,
    refetchInterval: 15000,
  });

  // Agregado barato: dice que alguien espera y desde cuándo, sin recorrer la cola.
  const summaryQuery = useQuery({
    queryKey: ["payment-claims-summary"],
    queryFn: () => payments.claimsSummary(),
    enabled: ready,
    retry: false,
    refetchInterval: 20000,
  });


  const unresolvedQuery = useQuery({
    queryKey: ["c2p-unresolved"],
    queryFn: () => payments.c2pUnresolved(),
    enabled: ready,
    retry: false,
    refetchInterval: 30000,
  });

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown"));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payment-claims"] });
    queryClient.invalidateQueries({ queryKey: ["c2p-unresolved"] });
    queryClient.invalidateQueries({ queryKey: ["floor"] });
  };

  // Confirmar acredita el dinero: sólo después de verlo en el banco.
  const confirmClaim = useMutation({
    mutationFn: (id: string) => payments.confirmClaim(id),
    onSuccess: () => {
      toast.success("Pago confirmado y acreditado");
      refresh();
    },
    onError: fail,
  });

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const rejectClaim = useMutation({
    mutationFn: (id: string) => payments.rejectClaim(id, reason.trim() || undefined),
    onSuccess: () => {
      setRejecting(null);
      setReason("");
      toast.success("Aviso rechazado. La referencia queda libre.");
      refresh();
    },
    onError: fail,
  });

  const [resolutions, setResolutions] = useState<Record<string, C2PResolution>>({});

  const resolveC2P = useMutation({
    mutationFn: (paymentId: string) => payments.resolveC2P(paymentId),
    onSuccess: (res) => {
      setResolutions((prev) => ({ ...prev, [res.paymentId]: res }));
      refresh();
    },
    onError: fail,
  });

  if (!ready) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> {t("backToDashboard")}
          </Link>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-3xl">Verificación de pagos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Splite no mueve el dinero: aquí se confirma lo que ya llegó al banco del restaurante.
        </p>

        <section className="surface mt-6 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl">Avisos de pago móvil</h2>
            {summaryQuery.data && summaryQuery.data.pending > 0 && (
              <p className="text-xs text-muted-foreground">
                {summaryQuery.data.pending} en espera
                {summaryQuery.data.oldestPendingAgeSeconds != null &&
                  ` · el más antiguo lleva ${formatWait(summaryQuery.data.oldestPendingAgeSeconds)}`}
              </p>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Un aviso no paga nada hasta que lo confirmas. Busca la referencia en tu app del banco.
          </p>

          {claimsQuery.isError && <ErrorBox error={claimsQuery.error} fallback={t("apiDown")} />}
          {claimsQuery.isSuccess && claimsQuery.data.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">No hay avisos por verificar.</p>
          )}
          <ul className="mt-4 space-y-3">
            {(claimsQuery.data ?? []).map((claim: StaffPaymentClaim) => (
              <li key={claim.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-display text-2xl">
                    {formatMoney(claim.amountVes, "VES")}
                  </span>
                  <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                    Por verificar
                  </span>
                </div>
                <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline">Referencia: </dt>
                    <dd className="inline tabular-nums text-foreground">
                      {claim.declaredReference ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">Banco del pagador: </dt>
                    <dd className="inline">{claim.bankOrigin ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">Teléfono: </dt>
                    <dd className="inline">{claim.phoneOrigin ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">Declarado: </dt>
                    <dd className="inline">
                      {new Date(claim.declaredAt ?? claim.createdAt).toLocaleString("es-VE")}
                    </dd>
                  </div>
                </dl>

                {rejecting === claim.id ? (
                  <div className="mt-3">
                    <input
                      autoFocus
                      value={reason}
                      maxLength={500}
                      placeholder="Motivo: no aparece, el monto no coincide…"
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={rejectClaim.isPending}
                        onClick={() => rejectClaim.mutate(claim.id)}
                        className="rounded-full border border-destructive px-4 py-2 text-xs text-destructive disabled:opacity-40"
                      >
                        Rechazar aviso
                      </button>
                      <button
                        onClick={() => setRejecting(null)}
                        className="rounded-full border border-border px-4 py-2 text-xs"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={confirmClaim.isPending}
                      onClick={() => confirmClaim.mutate(claim.id)}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" /> Confirmar: el dinero llegó
                    </button>
                    <button
                      onClick={() => {
                        setReason("");
                        setRejecting(claim.id);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs"
                    >
                      <X className="h-3.5 w-3.5" /> No aparece
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="surface mt-6 p-6">
          <h2 className="text-xl">Cargos C2P sin resolver</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            El banco no dio una respuesta clara. Volver a preguntar es seguro; cobrar de nuevo no.
          </p>
          {unresolvedQuery.isError && (
            <ErrorBox error={unresolvedQuery.error} fallback={t("apiDown")} />
          )}
          {unresolvedQuery.isSuccess && unresolvedQuery.data.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">No hay cargos pendientes.</p>
          )}
          <ul className="mt-4 space-y-3">
            {(unresolvedQuery.data ?? []).map((c: C2PUnresolvedCharge) => {
              const res = resolutions[c.paymentId];
              return (
                <li key={c.paymentId} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="font-display text-2xl">
                      {formatMoney(c.amountVes, "VES")}
                    </span>
                    <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                      {c.status === "IN_DOUBT" ? "Sin confirmar" : "Ambiguo"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.payerBankName ?? c.payerBankCode} · teléfono ••••{c.payerPhoneLast4} ·
                    factura {c.invoiceNumber}
                  </p>
                  {c.candidateReferences.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Movimientos que coinciden en monto: {c.candidateReferences.join(", ")}
                    </p>
                  )}
                  {c.lastReason && (
                    <p className="mt-1 text-xs text-muted-foreground">{c.lastReason}</p>
                  )}

                  <button
                    disabled={resolveC2P.isPending}
                    onClick={() => resolveC2P.mutate(c.paymentId)}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs disabled:opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Preguntar al banco
                  </button>

                  {res && (
                    <div className="mt-3 rounded-lg border border-border bg-secondary/60 p-3 text-xs">
                      <p className="font-medium">
                        {res.status === "SUCCEEDED"
                          ? "Liquidado: el movimiento se encontró y se acreditó."
                          : res.status === "FAILED"
                            ? "No hubo débito. El comensal puede pagar otra vez."
                            : res.status === "IN_DOUBT"
                              ? "Sigue sin confirmarse."
                              : "Débito confirmado sin poder acreditarlo: hace falta reembolso."}
                      </p>
                      {res.reason && <p className="mt-1 text-muted-foreground">{res.reason}</p>}
                      {res.resolutionPending && (
                        <p className="mt-1 text-muted-foreground">
                          La ventana de liquidación no ha pasado. Vuelve a intentarlo en{" "}
                          {res.retryAfterMinutes ?? 0} min.
                        </p>
                      )}
                      {res.bankReference && (
                        <p className="mt-1 text-muted-foreground">
                          Referencia del banco: {res.bankReference}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
