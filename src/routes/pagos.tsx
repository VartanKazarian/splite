import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, X } from "lucide-react";
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
import { ActivityFeed } from "@/components/ActivityFeed";
import { MyTipsCard } from "@/components/MyTipsCard";
import { PanelHeader } from "@/components/PanelHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatDateTime } from "../lib/dates";

export const Route = createFileRoute("/pagos")({
  head: () => ({
    meta: [
      { title: "Verificación de pagos — Splite" },
      {
        name: "description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Verificación de pagos — Splite" },
      {
        property: "og:description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

/** La espera se muestra en la unidad que importa: minutos, no segundos exactos. */
function formatWait(seconds: number, underMinute: string) {
  if (seconds < 60) return underMinute;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function PaymentsPage() {
  const { t, lang, plural } = useI18n();
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

  // El día en curso, calculado una vez: el informe del restaurante y el personal
  // tienen que mirar exactamente la misma ventana o no cuadran entre sí.
  // `to` exclusivo, para que un turno no cuente dos veces.
  const [todayFrom, todayTo] = useMemo(() => {
    const f = new Date();
    f.setHours(0, 0, 0, 0);
    const t = new Date(f);
    t.setDate(t.getDate() + 1);
    return [f.toISOString(), t.toISOString()];
  }, []);

  const tipsQuery = useQuery({
    queryKey: ["payment-tips-today", todayFrom],
    queryFn: () => payments.tips(todayFrom, todayTo),
    enabled: ready,
    retry: false,
    staleTime: 60000,
  });

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown"));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payment-claims"] });
    queryClient.invalidateQueries({ queryKey: ["payment-claims-summary"] });
    queryClient.invalidateQueries({ queryKey: ["payment-tips-today"] });
    queryClient.invalidateQueries({ queryKey: ["c2p-unresolved"] });
    queryClient.invalidateQueries({ queryKey: ["floor"] });
  };

  // Confirmar acredita el dinero: sólo después de verlo en el banco.
  const confirmClaim = useMutation({
    mutationFn: (id: string) => payments.confirmClaim(id),
    onSuccess: () => {
      toast.success(t("payConfirmed"));
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
      toast.success(t("payRejected"));
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
      <PanelHeader current="pagos" />

      <main className="mx-auto max-w-4xl px-5 py-8">
        {/* Actualizar vivía en la cabecera; la cabecera ahora es la misma en
            todas las pantallas, así que baja junto al título -- que es donde
            está en Tasas, la otra pantalla que se recarga a mano. */}
        <PageHeader
          title={t("payVerifyTitle")}
          meta={t("payVerifySub")}
          actions={
            <button
              onClick={refresh}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-secondary"
            >
              <RefreshCw className="h-4 w-4" /> {t("payRefresh")}
            </button>
          }
        />

        {/* Los movimientos, arriba del todo. Es la pregunta con la que se
            entra aquí -- "¿ha entrado ya ese cobro?" -- y estaba en el panel de
            la sala, que responde a otra cosa: cómo está el comedor ahora, no
            qué acaba de pasar. */}
        <div className="mt-6">
          <ActivityFeed />
        </div>

        <section className="surface mt-6 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl">{t("payClaimsTitle")}</h2>
            {summaryQuery.data && summaryQuery.data.pending > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("payWaiting").replace("{n}", String(summaryQuery.data.pending))}
                {summaryQuery.data.oldestPendingAgeSeconds != null &&
                  t("payOldest").replace(
                    "{age}",
                    formatWait(summaryQuery.data.oldestPendingAgeSeconds, t("waitUnderMinute")),
                  )}
              </p>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("payClaimsHint")}</p>

          {claimsQuery.isError && <ErrorBox error={claimsQuery.error} fallback={t("apiDown")} />}
          {claimsQuery.isSuccess && claimsQuery.data.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">{t("payNoClaims")}</p>
          )}
          <ul className="mt-4 space-y-3">
            {(claimsQuery.data ?? []).map((claim: StaffPaymentClaim) => (
              <li key={claim.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="figure text-2xl">{formatMoney(claim.amountVes, "VES")}</span>
                  <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                    {t("payToVerify")}
                  </span>
                </div>
                <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline">{t("payReference")}</dt>
                    <dd className="inline figure text-foreground">
                      {claim.declaredReference ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">{t("payPayerBank")}</dt>
                    <dd className="inline">{claim.bankOrigin ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t("payPhone")}</dt>
                    <dd className="inline">{claim.phoneOrigin ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t("payDeclared")}</dt>
                    <dd className="inline">
                      {formatDateTime(claim.declaredAt ?? claim.createdAt, lang) ?? "—"}
                    </dd>
                  </div>
                </dl>

                {rejecting === claim.id ? (
                  <div className="mt-3">
                    <input
                      autoFocus
                      value={reason}
                      maxLength={500}
                      placeholder={t("payRejectReason")}
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
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" /> {t("payConfirmArrived")}
                    </button>
                    <button
                      onClick={() => {
                        setReason("");
                        setRejecting(claim.id);
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-xs"
                    >
                      <X className="h-3.5 w-3.5" /> {t("payNotThere")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Antes del informe del restaurante, y sin gate de rol: lo tuyo lo ves
            seas quien seas, y es lo primero que busca un mesero al abrir esto. */}
        <MyTipsCard from={todayFrom} to={todayTo} />

        {tipsQuery.data && (
          <section className="surface mt-6 p-6">
            <h2 className="text-xl">{t("tipsToday")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("tipsTodayHint")}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="mt-1 figure">{formatMoney(tipsQuery.data.totalTipsVes, "VES")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("tipsInTill")}</dt>
                <dd className="mt-1 figure">{formatMoney(tipsQuery.data.inTillVes, "VES")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("tipsOwedToStaff")}</dt>
                <dd className="mt-1 figure">{formatMoney(tipsQuery.data.owedToStaffVes, "VES")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("tipsUnclassified")}</dt>
                <dd className="mt-1 figure">
                  {formatMoney(tipsQuery.data.unclassifiedVes, "VES")}
                </dd>
              </div>
            </dl>

            {/* Lo que el backend calculaba y nadie enseñaba. La atribución se lee
                por la cuenta en el momento de consultar, así que corregir quién
                atendió una mesa mueve también estas cifras. */}
            {(tipsQuery.data.byServer?.length ?? 0) > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="text-sm">{t("tipsByWaiter")}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {tipsQuery.data.byServer?.map((row) => (
                    <li
                      key={row.userId ?? "__unassigned__"}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className={row.userId ? "" : "text-muted-foreground"}>
                        {row.email ?? t("tipsNoWaiter")}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.payments} {plural(row.payments, "payment")}
                        </span>
                      </span>
                      <span className="shrink-0 figure">{formatMoney(row.tipsVes, "VES")}</span>
                    </li>
                  ))}
                </ul>
                {tipsQuery.data.byServer?.some((r) => !r.userId) && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Las cuentas sin mesero asignado se agrupan aparte. Puedes asignarlo desde el
                    panel de la mesa, también después de cerrarla.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <section className="surface mt-6 p-6">
          <h2 className="text-xl">{t("c2pUnresolvedTitle")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("c2pUnresolvedHint")}</p>
          {unresolvedQuery.isError && (
            <ErrorBox error={unresolvedQuery.error} fallback={t("apiDown")} />
          )}
          {unresolvedQuery.isSuccess && unresolvedQuery.data.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">{t("c2pNoPending")}</p>
          )}
          <ul className="mt-4 space-y-3">
            {(unresolvedQuery.data ?? []).map((c: C2PUnresolvedCharge) => {
              const res = resolutions[c.paymentId];
              return (
                <li key={c.paymentId} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="figure text-2xl">{formatMoney(c.amountVes, "VES")}</span>
                    <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                      {c.status === "IN_DOUBT" ? t("c2pInDoubt") : t("c2pAmbiguous")}
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
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-xs disabled:opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Preguntar al banco
                  </button>

                  {res && (
                    <div className="mt-3 rounded-lg border border-border bg-secondary/60 p-3 text-xs">
                      <p className="font-medium">
                        {res.status === "SUCCEEDED"
                          ? t("c2pSettled")
                          : res.status === "FAILED"
                            ? t("c2pNoDebit")
                            : res.status === "IN_DOUBT"
                              ? t("c2pStillUnconfirmed")
                              : t("c2pNeedsRefund")}
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
