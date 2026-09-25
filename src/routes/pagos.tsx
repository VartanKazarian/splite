import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import {
  account,
  ApiError,
  auth,
  bankConnections,
  formatMoney,
  payments,
  staffSession,
  type C2PResolution,
  type C2PUnresolvedCharge,
  type BankMatch,
  type StaffPaymentClaim,
} from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { MyTipsCard } from "@/components/MyTipsCard";
import { BillServerPicker, canAssignServer } from "@/components/BillServerPicker";
import { FxRatesCard } from "@/components/panel/FxRatesCard";
import { FiscalPanel } from "@/components/panel/FiscalPanel";
import { PanelHeader } from "@/components/PanelHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatementImport } from "@/components/panel/StatementImport";
import { formatDateTime } from "../lib/dates";

export const Route = createFileRoute("/pagos")({
  head: () => ({
    meta: [
      { title: "Verificación de pagos — Splite" },
      {
        name: "description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      { property: "og:title", content: "Verificación de pagos — Splite" },
      {
        property: "og:description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
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

/**
 * Qué dice el banco de un aviso. Sólo sugiere: confirmar sigue siendo del
 * personal salvo que el dueño haya dejado que el banco confirme solo. Una
 * referencia que existe con otro importe es la señal que más importa: el
 * aviso puede ser un pago real mal tecleado o uno que no llegó entero.
 */
function BankMatchBadge({ match, id }: { match: BankMatch; id: string }) {
  const { t } = useI18n();
  const ref = match.movementReference ? `…${match.movementReference.slice(-6)}` : "";
  const [tone, text] =
    match.outcome === "MATCHED"
      ? [
          "border-primary/40 bg-primary/10 text-primary",
          t(match.autoConfirmed ? "bankMatchAuto" : "bankMatchMatched").replace("{ref}", ref),
        ]
      : match.outcome === "MISMATCH"
        ? [
            "border-destructive/40 bg-destructive/10 text-destructive",
            t("bankMatchMismatch").replace(
              "{fields}",
              match.disagreements.map((f) => t(`bankField_${f}`)).join(", "),
            ),
          ]
        : match.outcome === "AMBIGUOUS"
          ? ["border-amber-500/50 bg-amber-500/10 text-amber-800", t("bankMatchAmbiguous")]
          : ["border-border text-muted-foreground", t("bankMatchNotFound")];
  return (
    <p
      className={`mt-2 rounded-lg border px-3 py-2 text-xs ${tone}`}
      data-testid={`claim-bank-${id}`}
      data-outcome={match.outcome}
    >
      {text}
    </p>
  );
}

function PaymentsPage() {
  const { t, lang, plural } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.location.hash.replace("#", ""),
  );
  useEffect(() => {
    const sync = () => setTab(window.location.hash.replace("#", ""));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

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

  // Quién puede corregir a quién se le atribuye una cuenta. La política la
  // decide el servidor -- OWNER y MANAGER, porque esto mueve dinero entre
  // personas --; aquí sólo se decide si se enseña el selector o se explica a
  // quién pedírselo. Misma clave que el resto del panel: una consulta.
  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), enabled: ready, retry: false });
  // La cuenta, sólo por sus capacidades de plan. Comparte `queryKey` con el
  // resto del panel, así que no añade una petición: reusa la que ya hay.
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    enabled: ready,
    retry: false,
  });
  const canAssign = canAssignServer(me.data?.user.role);

  // Las conexiones con el banco, para ofrecer subir el estado de cuenta junto
  // a los avisos que va a comprobar. Caja también lo sube; el mesero no.
  const role = me.data?.user.role;
  const canVerifyWithBank = role === "OWNER" || role === "MANAGER" || role === "CASHIER";
  const bankQuery = useQuery({
    queryKey: ["bank-connections"],
    queryFn: () => bankConnections.list(),
    enabled: ready && canVerifyWithBank,
    retry: false,
  });
  const statementConnection = bankQuery.data?.find((c) => c.kind === "STATEMENT_IMPORT");
  const [importOpen, setImportOpen] = useState(false);

  // Reasignar mueve las propinas de sitio, así que el informe se vuelve a pedir.
  const refreshTips = () =>
    queryClient.invalidateQueries({ queryKey: ["payment-tips-today", todayFrom] });

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

  // Tres pestañas y el hash manda, igual que en Configuración: `/pagos#tasas`
  // es a donde redirige la ruta vieja de Tasas.
  // Facturación sólo aparece si el plan la incluye. No se esconde por vergüenza
  // -- una pestaña que contesta 403 al pulsarla es peor que una que no está --
  // y se lee de `plan.capabilities` en vez de codificar aquí la tabla de
  // precios, que sería mantenerla dos veces.
  const canInvoice = accountQuery.data?.plan?.capabilities?.["fiscalInvoicing"] === true;

  const TABS = [
    ["cobros", t("payTabCollections")],
    ["propinas", t("payTabTips")],
    ["tasas", t("fxRates")],
    ...(canInvoice ? ([["facturacion", t("fiscalTab")]] as const) : []),
  ] as const;
  const current = TABS.some(([id]) => id === tab) ? tab : "cobros";

  if (!ready) return null;

  return (
    <div className="min-h-screen">
      <PanelHeader current="pagos" />

      <main className="mx-auto max-w-4xl px-5 py-8">
        {/* Actualizar vivía en la cabecera; la cabecera ahora es la misma en
            todas las pantallas, así que baja junto al título -- que es donde
            está en Tasas, la otra pantalla que se recarga a mano. */}
        {/* El título es el de la pestaña. «Verificación de pagos» encabezaba
            también propinas, tasa y facturas, que no verifican nada. */}
        <PageHeader
          title={
            current === "propinas"
              ? t("payTabTips")
              : current === "tasas"
                ? t("fxRates")
                : current === "facturacion"
                  ? t("fiscalTab")
                  : t("payVerifyTitle")
          }
          meta={
            current === "propinas"
              ? t("payTipsSub")
              : current === "tasas"
                ? t("payRatesSub")
                : current === "facturacion"
                  ? t("payInvoicesSub")
                  : t("payVerifySub")
          }
          actions={
            current === "cobros" ? (
              <button
                onClick={refresh}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-secondary"
              >
                <RefreshCw className="h-4 w-4" /> {t("payRefresh")}
              </button>
            ) : null
          }
        />

        {/* Tres pestañas, y no un solo rollo de 3.210 px. Movimiento, avisos y
            C2P responden a "¿ha entrado ya ese cobro?"; las propinas son otra
            pregunta y estaban en medio. Y la tasa, que era una parada entera de
            la barra de arriba para dos números, cae aquí: es la misma cuenta.
            Ver `FxRatesCard`. */}
        <nav
          aria-label={t("paymentsNav")}
          className="mt-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={current === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                window.history.replaceState(null, "", `#${id}`);
                window.scrollTo({ top: 0 });
              }}
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-xs transition-colors ${
                current === id
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {current === "cobros" && (
          <>
            {/* Lo que espera a alguien, arriba del todo. El número de la
            pestaña cuenta estos avisos, así que tocarlo tiene que llevar a
            ellos y no a veinte filas de historial que ya no piden nada. El
            movimiento va al final: responde a «¿qué pasó?», no a «¿qué hago?». */}
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

              {/* Comprobar contra el banco sin abrir su app: se sube el estado
                  de cuenta y cada aviso dice si el dinero llegó. Al dueño que
                  aún no lo ha activado se le dice dónde; al resto, nada. */}
              {statementConnection ? (
                <>
                  <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    data-testid="bank-import-open"
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong px-4 text-sm"
                  >
                    <FileUp className="h-4 w-4" /> {t("bankImportButton")}
                  </button>
                  <StatementImport
                    connection={statementConnection}
                    open={importOpen}
                    onOpenChange={setImportOpen}
                  />
                </>
              ) : (
                role === "OWNER" &&
                bankQuery.isSuccess && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <Link to="/settings" hash="banco" className="underline underline-offset-2">
                      {t("bankImportSetup")}
                    </Link>
                  </p>
                )
              )}

              {claimsQuery.isError && (
                <ErrorBox error={claimsQuery.error} fallback={t("apiDown")} />
              )}
              {/* Mientras carga, la forma de lo que viene.
                  Esta pantalla se abre para responder «¿ha entrado ya ese
                  cobro?», y hasta ahora no dibujaba nada hasta tener la
                  respuesta: unos segundos de tarjeta vacía sobre la que no se
                  sabe si no hay nada pendiente o si todavía no ha llegado. Son
                  dos respuestas opuestas.

                  Con el hueco ocupado tampoco salta la página cuando llegan
                  las filas. `aria-hidden` porque no hay nada que leer: quien
                  usa un lector de pantalla oye el resultado cuando exista. */}
              {claimsQuery.isPending && (
                <ul aria-hidden className="mt-4 space-y-3">
                  {[0, 1].map((i) => (
                    <li key={i} className="rounded-lg border border-border p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <Skeleton className="h-7 w-36" />
                        <Skeleton className="h-4 w-28 rounded-full" />
                      </div>
                      <Skeleton className="mt-4 h-3 w-full" />
                      <Skeleton className="mt-2 h-3 w-2/3" />
                      <Skeleton className="mt-4 h-11 w-44 rounded-full" />
                    </li>
                  ))}
                </ul>
              )}
              {claimsQuery.isSuccess && claimsQuery.data.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">{t("payNoClaims")}</p>
              )}
              <ul className="mt-4 space-y-3">
                {(claimsQuery.data ?? []).map((claim: StaffPaymentClaim) => (
                  <li key={claim.id} className="rounded-lg border border-border p-4">
                    {/* De qué mesa es, antes que nada: con varios avisos en
                        cola, dos mesas pagan a menudo lo mismo. */}
                    <p className="text-sm font-medium" data-testid={`claim-table-${claim.id}`}>
                      {claim.tableName ?? t("tipsBillNoTable")}
                      {claim.payerName && (
                        <span className="font-normal text-muted-foreground">
                          {" · "}
                          {claim.payerName}
                        </span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
                      {/* Lo que llegó al banco: la parte más la propina, en una
                          sola transferencia. Es la cifra que se busca en la app
                          del banco; la parte sola no aparece en ningún sitio. */}
                      <span className="money-lg" data-testid={`claim-amount-${claim.id}`}>
                        {formatMoney(claim.totalPaidVes ?? claim.amountVes, "VES")}
                      </span>
                      <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                        {t("payToVerify")}
                      </span>
                    </div>
                    {claim.tipVes && BigInt(claim.tipVes) > 0n && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("payIncludesTip")
                          .replace("{bill}", formatMoney(claim.amountVes, "VES"))
                          .replace("{tip}", formatMoney(claim.tipVes, "VES"))}
                      </p>
                    )}
                    {claim.bankMatch && <BankMatchBadge match={claim.bankMatch} id={claim.id} />}
                    <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>
                        <dt className="inline">{t("payReference")}</dt>
                        <dd className="inline figure text-foreground">
                          {claim.declaredReference ?? "—"}
                        </dd>
                      </div>
                      {/* Sólo lo que el comensal dio. «Banco: —» y
                          «Teléfono: —» eran dos líneas por tarjeta que no
                          ayudaban a buscar nada, y con diecisiete avisos en
                          cola suman una pantalla. */}
                      {(claim.bankOriginName ?? claim.bankOrigin) && (
                        <div>
                          <dt className="inline">{t("payPayerBank")}</dt>
                          <dd className="inline">{claim.bankOriginName ?? claim.bankOrigin}</dd>
                        </div>
                      )}
                      {claim.phoneOrigin && (
                        <div>
                          <dt className="inline">{t("payPhone")}</dt>
                          <dd className="inline figure">{claim.phoneOrigin}</dd>
                        </div>
                      )}
                      {claim.idOrigin && (
                        <div>
                          <dt className="inline">{t("payIdOrigin")}</dt>
                          <dd className="inline figure">{claim.idOrigin}</dd>
                        </div>
                      )}
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
                            {t("payRejectClaim")}
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
                      // Lado a lado, y confirmar ocupa lo que sobra: apiladas, cada
                      // tarjeta medía una pantalla y la cola no se podía recorrer.
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <button
                          data-testid={`claim-confirm-${claim.id}`}
                          disabled={confirmClaim.isPending}
                          onClick={() => confirmClaim.mutate(claim.id)}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-center text-xs font-medium text-primary-foreground disabled:opacity-40"
                        >
                          <Check className="h-3.5 w-3.5 shrink-0" /> {t("payConfirmArrived")}
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
            <section className="surface mt-6 p-6">
              <h2 className="text-xl">{t("c2pUnresolvedTitle")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("c2pUnresolvedHint")}</p>
              {unresolvedQuery.isError && (
                <ErrorBox error={unresolvedQuery.error} fallback={t("apiDown")} />
              )}
              {unresolvedQuery.isPending && (
                <ul aria-hidden className="mt-4 space-y-3">
                  <li className="rounded-lg border border-border p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <Skeleton className="h-7 w-36" />
                      <Skeleton className="h-4 w-28 rounded-full" />
                    </div>
                    <Skeleton className="mt-4 h-3 w-3/4" />
                  </li>
                </ul>
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
                        <span className="money-lg">{formatMoney(c.amountVes, "VES")}</span>
                        <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                          {c.status === "IN_DOUBT" ? t("c2pInDoubt") : t("c2pAmbiguous")}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("c2pChargeLine")
                          .replace("{bank}", c.payerBankName ?? c.payerBankCode ?? "")
                          .replace("{last4}", c.payerPhoneLast4 ?? "")
                          .replace("{invoice}", c.invoiceNumber ?? "")}
                      </p>
                      {c.candidateReferences.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("c2pCandidates").replace("{refs}", c.candidateReferences.join(", "))}
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
                        <RefreshCw className="h-3.5 w-3.5" /> {t("c2pAskBank")}
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
                              {t("c2pRetryIn").replace("{n}", String(res.retryAfterMinutes ?? 0))}
                            </p>
                          )}
                          {res.bankReference && (
                            <p className="mt-1 text-muted-foreground">
                              {t("c2pBankReference").replace("{ref}", res.bankReference)}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="mt-6">
              <ActivityFeed />
            </div>
          </>
        )}

        {current === "propinas" && (
          <>
            {/* Lo tuyo lo ves seas quien seas. A un mesero es lo primero que le
            importa, así que va arriba; a quien reparte (dueño, encargado) le
            importa el reparto del equipo, y lo suyo -- casi siempre cero, porque
            no sirve mesas -- baja al final. */}
            {!canAssign && <MyTipsCard from={todayFrom} to={todayTo} />}

            {tipsQuery.data && (
              <section className="surface mt-6 p-6">
                <h2 className="text-xl">{t("tipsToday")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("tipsTodayHint")}</p>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Total</dt>
                    <dd className="mt-1 figure">
                      {formatMoney(tipsQuery.data.totalTipsVes, "VES")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("tipsInTill")}</dt>
                    <dd className="mt-1 figure">{formatMoney(tipsQuery.data.inTillVes, "VES")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("tipsOwedToStaff")}</dt>
                    <dd className="mt-1 figure">
                      {formatMoney(tipsQuery.data.owedToStaffVes, "VES")}
                    </dd>
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
                    {/* Y las cuentas que hay detrás de esa fila, para poder
                        arreglarlas aquí.
                        Antes había una frase que decía que se asignaba «desde
                        el panel de la mesa, también después de cerrarla». Lo
                        segundo es cierto en la API y falso en la pantalla: ese
                        selector vive en la hoja de una mesa, y una cuenta
                        cerrada libera la mesa y desaparece de todos los
                        listados. Quien lee este informe lo lee al cerrar el
                        turno, cuando ya están todas cerradas. */}
                    {(tipsQuery.data.unassigned?.length ?? 0) > 0 && (
                      <div className="mt-4 rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">
                          {canAssign ? t("tipsFixHere") : t("tipsFixAsk")}
                        </p>
                        <ul className="mt-2 divide-y divide-border">
                          {tipsQuery.data.unassigned?.map((row) => (
                            <li
                              key={row.billId}
                              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2"
                            >
                              <span className="min-w-0 text-sm">
                                {row.tableName ?? t("tipsBillNoTable")}
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {formatDateTime(row.lastPaidAt, lang)}
                                </span>
                              </span>
                              <span className="flex items-center gap-3">
                                <span className="money-sm">{formatMoney(row.tipsVes, "VES")}</span>
                                <BillServerPicker
                                  billId={row.billId}
                                  servedBy={null}
                                  canAssign={canAssign}
                                  onChanged={refreshTips}
                                />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {canAssign && <MyTipsCard from={todayFrom} to={todayTo} />}
          </>
        )}

        {current === "tasas" && <FxRatesCard />}

        {current === "facturacion" && <FiscalPanel canExport={canAssign} />}
      </main>
    </div>
  );
}
