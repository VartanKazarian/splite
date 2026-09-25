import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { toast } from "sonner";

import { ApiError, formatMoney, parseMinorInput } from "@/lib/api";
import {
  ACTION_LABEL,
  admin,
  caracasToday,
  CYCLE_LABEL,
  formatDay,
  METHOD_LABEL,
  type AdminCharge,
  type ClientDetail,
  type Cycle,
  type PaymentMethod,
  type SubscriptionStatus,
  type Tier,
} from "@/lib/adminApi";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";
import { StateBadge } from "@/components/admin/StateBadge";
import { ChargeStatus } from "@/components/admin/ChargeStatus";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/dates";

export const Route = createFileRoute("/admin/clientes/$restaurantId")({
  head: adminHead("Cliente"),
  component: ClientPage,
});

const usd = (cents: string | null) => (cents === null ? "—" : formatMoney(cents, "USD"));

/** "36.50000000" → "36,50": la tasa como se lee en Venezuela, sin los ceros de la columna. */
const formatRate = (rate: string | null) => {
  if (!rate) return "—";
  const [whole = "0", frac = ""] = rate.split(".");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${trimmed}`;
};

const fail = (e: unknown) =>
  toast.error(e instanceof ApiError ? `${e.code} · ${e.message}` : "No se pudo conectar");

const smallBtn =
  "inline-flex min-h-10 items-center rounded-full border border-border-strong px-4 text-sm disabled:opacity-40";
const smallPrimary =
  "inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40";

const field =
  "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring";

function ClientPage() {
  const { restaurantId } = Route.useParams();
  return (
    <AdminShell current="clientes">
      {(session) => <Client id={restaurantId} canEdit={session.operator.role === "ADMIN"} />}
    </AdminShell>
  );
}

function Client({ id, canEdit }: { id: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "client", id], queryFn: () => admin.client(id) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "client", id] });
    void qc.invalidateQueries({ queryKey: ["admin", "clients"] });
    void qc.invalidateQueries({ queryKey: ["admin", "charges"] });
  };
  const [dialog, setDialog] = useState<
    | null
    | { kind: "plan" }
    | { kind: "billing" }
    | { kind: "pay"; chargeId: string | null }
    | { kind: "void"; charge: AdminCharge }
  >(null);

  const createCharge = useMutation({
    mutationFn: () => admin.createCharge(id),
    onSuccess: (r) => {
      toast.success(`Cargo generado: ${usd(r.charge.amountUsd)}`);
      refresh();
    },
    onError: fail,
  });

  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudo cargar el cliente.
      </p>
    );
  }
  if (!query.data) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const { client: c, charges, payments, usage, setup, history } = query.data;
  const open = charges.filter((x) => x.status === "OPEN");

  return (
    <>
      <Link
        to="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl" data-testid="admin-client-name">
          {c.name}
        </h1>
        <StateBadge state={c.state} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {c.ownerEmail ?? "sin dueño activo"} · RIF {c.rif ?? "—"} · cliente desde{" "}
        {formatDateTime(c.createdAt, "es") ?? "—"}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* Plan y cobro */}
          <section className="surface p-5" data-testid="admin-subscription">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg">Suscripción</h2>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "plan" })}
                    className={smallBtn}
                    data-testid="admin-change-plan"
                  >
                    Cambiar plan
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "billing" })}
                    className={smallBtn}
                    data-testid="admin-edit-billing"
                  >
                    Editar cobro
                  </button>
                </div>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Item label="Plan">{c.tier}</Item>
              <Item label="Ciclo">{CYCLE_LABEL[c.billingCycle]}</Item>
              <Item label="Precio">
                {usd(c.priceUsd)}
                {c.customPriceUsd && (
                  <span className="block text-xs text-muted-foreground">
                    pactado · lista {usd(c.listPriceUsd)}
                  </span>
                )}
              </Item>
              {c.tier === "TRIAL" && (
                <Item label="Prueba hasta">{formatDateTime(c.trialEndsAt, "es") ?? "—"}</Item>
              )}
              <Item label="Estado del cobro">
                {c.subscriptionStatus === "ACTIVE"
                  ? "Activa"
                  : c.subscriptionStatus === "SUSPENDED"
                    ? "Suspendida"
                    : "Cancelada"}
              </Item>
              <Item label="Debe">
                <span className={BigInt(c.balanceUsd) > 0n ? "font-medium text-destructive" : ""}>
                  {usd(c.balanceUsd)}
                </span>
              </Item>
            </dl>
            {c.notes && (
              <p className="mt-4 whitespace-pre-wrap rounded-lg bg-secondary p-3 text-sm">
                {c.notes}
              </p>
            )}
          </section>

          {/* Cargos */}
          <section className="surface p-5" data-testid="admin-charges">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg">Cargos</h2>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={createCharge.isPending}
                    onClick={() => createCharge.mutate()}
                    className={smallBtn}
                    data-testid="admin-create-charge"
                  >
                    Generar siguiente cargo
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "pay", chargeId: open[0]?.id ?? null })}
                    className={smallPrimary}
                    data-testid="admin-record-payment"
                  >
                    Registrar pago
                  </button>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Lo que debe por periodo, en dólares de referencia. No es una factura fiscal.
            </p>
            {charges.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Todavía no tiene cargos.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {charges.map((ch) => (
                  <li
                    key={ch.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
                    data-testid={`admin-charge-${ch.id}`}
                  >
                    <span className="min-w-[180px] flex-1">
                      {formatDay(ch.periodStart)} → {formatDay(ch.periodEnd)}
                      <span className="block text-xs text-muted-foreground">
                        {ch.tier} · vence {formatDay(ch.dueOn)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {usd(ch.amountUsd)}
                      {ch.status === "OPEN" && BigInt(ch.paidUsd) > 0n && (
                        <span className="block text-xs text-muted-foreground">
                          faltan {usd(ch.remainingUsd)}
                        </span>
                      )}
                    </span>
                    <ChargeStatus ch={ch} />
                    {canEdit && ch.status === "OPEN" && (
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "pay", chargeId: ch.id })}
                          className="text-xs text-primary underline underline-offset-2"
                        >
                          Pagar
                        </button>
                        {BigInt(ch.paidUsd) === 0n && (
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: "void", charge: ch })}
                            className="ml-2 text-xs text-muted-foreground underline underline-offset-2"
                          >
                            Anular
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pagos */}
          <section className="surface p-5">
            <h2 className="text-lg">Pagos recibidos</h2>
            {payments.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Ninguno todavía.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border" data-testid="admin-payments">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-sm"
                  >
                    <span className="min-w-[120px]">{formatDay(p.receivedOn)}</span>
                    <span className="flex-1">
                      {METHOD_LABEL[p.method]}
                      {p.reference && (
                        <span className="text-muted-foreground"> · ref {p.reference}</span>
                      )}
                      {p.recordedBy && (
                        <span className="block text-xs text-muted-foreground">
                          por {p.recordedBy}
                        </span>
                      )}
                    </span>
                    <span className="text-right tabular-nums">
                      {formatMoney(p.amount, p.currency)}
                      {p.currency === "VES" && (
                        <span className="block text-xs text-muted-foreground">
                          = {usd(p.appliedUsd)} a {formatRate(p.fxRate)} Bs/$
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="surface p-5">
            <h2 className="text-lg">Uso · 30 días</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Item label="Cuentas atendidas">{usage.bills30d}</Item>
              <Item label="Cobrado">{formatMoney(usage.collectedVes30d, "VES")}</Item>
              <Item label="Mesas">{usage.tables}</Item>
              <Item label="Equipo">{usage.staff}</Item>
              <Item label="Productos">{usage.products}</Item>
              <Item label="Última actividad">
                {formatDateTime(c.lastActivityAt, "es") ?? "Nunca"}
              </Item>
            </dl>
          </section>

          <section className="surface p-5">
            <h2 className="text-lg">Puesta en marcha</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(
                [
                  [setup.menuLoaded, "Carta cargada"],
                  [setup.tablesCreated, "Mesas creadas"],
                  [setup.rifSet, "RIF registrado"],
                  [setup.bankConnected, "Banco conectado"],
                ] as const
              ).map(([done, label]) => (
                <li key={label} className="flex items-center gap-2">
                  {done ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={done ? "" : "text-muted-foreground"}>{label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface p-5">
            <h2 className="text-lg">Historial</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Sin cambios desde la consola.</p>
            ) : (
              <ol className="mt-3 space-y-3 text-sm" data-testid="admin-history">
                {history.map((h, i) => (
                  <li key={i}>
                    <p className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(h.at, "es")} · {h.operatorEmail ?? "línea de comandos"}
                    </p>
                    <HistoryDetail action={h.action} details={h.details} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {dialog?.kind === "plan" && (
        <PlanDialog c={query.data} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === "billing" && (
        <BillingDialog c={query.data} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === "pay" && (
        <PaymentDialog
          id={id}
          open={open}
          chargeId={dialog.chargeId}
          onClose={() => setDialog(null)}
          onDone={refresh}
        />
      )}
      {dialog?.kind === "void" && (
        <VoidDialog charge={dialog.charge} onClose={() => setDialog(null)} onDone={refresh} />
      )}
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

function HistoryDetail({
  action,
  details,
}: {
  action: string;
  details: Record<string, unknown> | null;
}) {
  if (!details) return null;
  const d = details as {
    from?: string;
    to?: string;
    note?: string | null;
    periodStart?: string;
    amountUsd?: string;
    reason?: string | null;
    appliedUsd?: string;
    closedCharge?: boolean;
  };
  let text = "";
  if (action === "PLAN_CHANGED") text = `${d.from} → ${d.to}${d.note ? ` · ${d.note}` : ""}`;
  else if (action === "CHARGE_CREATED")
    text = `${formatDay(d.periodStart ?? null)} · ${usd(d.amountUsd ?? null)}`;
  else if (action === "CHARGE_VOIDED") text = String(d.reason ?? "");
  else if (action === "PAYMENT_RECORDED")
    text = `${usd(d.appliedUsd ?? null)}${d.closedCharge ? " · cargo cerrado" : ""}`;
  else if (action === "SUBSCRIPTION_UPDATED" && d.reason) text = String(d.reason);
  return text ? <p className="text-xs text-muted-foreground">{text}</p> : null;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({
  c,
  onClose,
  onDone,
}: {
  c: ClientDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tier, setTier] = useState<Tier>(c.client.tier);
  const [trialDays, setTrialDays] = useState("14");
  const [note, setNote] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (force: boolean) =>
      admin.changePlan(c.client.id, {
        tier,
        trialDays: tier === "TRIAL" ? Number(trialDays) || null : null,
        force,
        note: note.trim() || null,
      }),
    onSuccess: (r) => {
      toast.success(`Plan cambiado a ${r.tier}`);
      onDone();
      onClose();
    },
    onError: (e) => {
      // Bajar de plan quitando algo que ya usa: se explica y se pide confirmar.
      if (e instanceof ApiError && e.code === "PLAN_DOWNGRADE_BLOCKED") {
        const breaking = (e.details as { breaking?: { detail: string }[] }).breaking ?? [];
        setBlocked(breaking.map((b) => b.detail).join("; ") || "pierde algo que ya usa");
        return;
      }
      fail(e);
    },
  });
  return (
    <Modal title="Cambiar plan" onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Plan
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
            className={field}
            data-testid="admin-plan-tier"
          >
            {(["TRIAL", "STARTER", "PRO", "ENTERPRISE"] as const).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {tier === "TRIAL" && (
          <label className="grid gap-1 text-sm">
            Días de prueba desde hoy
            <input
              inputMode="numeric"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value.replace(/\D/g, ""))}
              className={field}
            />
          </label>
        )}
        <label className="grid gap-1 text-sm">
          Nota (queda en el historial)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Firmó el contrato anual…"
            className={field}
          />
        </label>
        {blocked && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            Esta bajada le quita algo que ya usa: {blocked}. Confírmalo sólo si lo acordaste con el
            cliente.
          </p>
        )}
        <button
          type="button"
          disabled={change.isPending || tier === c.client.tier}
          onClick={() => change.mutate(Boolean(blocked))}
          className={
            blocked
              ? "inline-flex min-h-12 w-full items-center justify-center rounded-full border border-destructive/60 text-sm font-medium text-destructive"
              : "btn-primary w-full"
          }
          data-testid="admin-plan-save"
        >
          {blocked ? "Bajar de todos modos" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

function BillingDialog({
  c,
  onClose,
  onDone,
}: {
  c: ClientDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const cl = c.client;
  const [cycle, setCycle] = useState<Cycle>(cl.billingCycle);
  const [custom, setCustom] = useState(
    cl.customPriceUsd ? formatMoney(cl.customPriceUsd, "USD").replace("$", "") : "",
  );
  const [status, setStatus] = useState<SubscriptionStatus>(cl.subscriptionStatus);
  const [notes, setNotes] = useState(cl.notes ?? "");
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () =>
      admin.updateSubscription(cl.id, {
        billingCycle: cycle,
        customPriceUsd: custom.trim() ? parseMinorInput(custom) : null,
        status,
        notes: notes.trim() || null,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Cobro actualizado");
      onDone();
      onClose();
    },
    onError: fail,
  });
  return (
    <Modal title="Editar cobro" onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Ciclo
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value as Cycle)}
            className={field}
          >
            <option value="MONTHLY">Mensual</option>
            <option value="ANNUAL">Anual</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Precio pactado en $ (vacío = precio de lista {usd(cl.listPriceUsd)})
          <input
            inputMode="decimal"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="45,00"
            className={field}
            data-testid="admin-custom-price"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Estado
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
            className={field}
          >
            <option value="ACTIVE">Activa</option>
            <option value="SUSPENDED">Suspendida</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
          <span className="text-xs text-muted-foreground">
            Por ahora sólo queda registrado: suspender no apaga nada en el panel del restaurante.
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          Notas del cliente
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${field} py-2`}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Motivo del cambio (historial)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Socio fundador, descuento 12 meses"
            className={field}
          />
        </label>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="btn-primary w-full"
          data-testid="admin-billing-save"
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}

function PaymentDialog({
  id,
  open,
  chargeId,
  onClose,
  onDone,
}: {
  id: string;
  open: AdminCharge[];
  chargeId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [charge, setCharge] = useState(chargeId ?? "");
  const [currency, setCurrency] = useState<"VES" | "USD">("VES");
  const [method, setMethod] = useState<PaymentMethod>("PAGO_MOVIL");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [reference, setReference] = useState("");
  const [receivedOn, setReceivedOn] = useState(caracasToday());
  const [settle, setSettle] = useState(false);

  const minor = amount.trim() ? parseMinorInput(amount) : "";
  // La tasa se escribe a la venezolana (36,52) o con punto; se manda con punto.
  const rateText = rate
    .trim()
    .replace(/\./g, (m, i, s: string) => (s.includes(",") ? "" : m))
    .replace(",", ".");
  const preview =
    currency === "VES" && minor && /^\d+(\.\d+)?$/.test(rateText) && Number(rateText) > 0
      ? formatMoney(String(Math.round(Number(minor) / Number(rateText))), "USD")
      : null;

  const save = useMutation({
    mutationFn: () =>
      admin.recordPayment(id, {
        chargeId: charge || null,
        method,
        currency,
        amount: minor,
        fxRate: currency === "VES" && rateText ? rateText : null,
        reference: reference.trim() || null,
        receivedOn,
        settle,
      }),
    onSuccess: (r) => {
      toast.success(
        r.charge?.status === "PAID"
          ? "Pago registrado. El cargo quedó pagado."
          : `Pago registrado: ${formatMoney(r.payment.appliedUsd, "USD")}`,
      );
      onDone();
      onClose();
    },
    onError: fail,
  });

  return (
    <Modal title="Registrar pago" onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Cargo que paga
          <select
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
            className={field}
            data-testid="admin-pay-charge"
          >
            <option value="">Ninguno (a cuenta)</option>
            {open.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {formatDay(ch.periodStart)} · faltan {usd(ch.remainingUsd)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Moneda
            <select
              value={currency}
              onChange={(e) => {
                const v = e.target.value as "VES" | "USD";
                setCurrency(v);
                setMethod(v === "VES" ? "PAGO_MOVIL" : "ZELLE");
              }}
              className={field}
              data-testid="admin-pay-currency"
            >
              <option value="VES">Bolívares</option>
              <option value="USD">Dólares</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Vía
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className={field}
            >
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          Monto recibido ({currency === "VES" ? "Bs" : "$"})
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currency === "VES" ? "2.155,20" : "59,00"}
            className={field}
            data-testid="admin-pay-amount"
          />
        </label>
        {currency === "VES" && (
          <label className="grid gap-1 text-sm">
            Tasa Bs/$
            <input
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Vacío = tasa BCV de hoy"
              className={field}
              data-testid="admin-pay-rate"
            />
            {preview && (
              <span className="text-xs text-muted-foreground">Descuenta ≈ {preview}</span>
            )}
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Referencia
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={field}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Fecha
            <input
              type="date"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
              className={field}
            />
          </label>
        </div>
        {charge && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={settle}
              onChange={(e) => setSettle(e.target.checked)}
              className="mt-1"
            />
            <span>
              Dar el cargo por pagado aunque falten céntimos
              <span className="block text-xs text-muted-foreground">
                Queda dicho en el historial.
              </span>
            </span>
          </label>
        )}
        <button
          type="button"
          disabled={save.isPending || !minor || minor === "0"}
          onClick={() => save.mutate()}
          className="btn-primary w-full"
          data-testid="admin-pay-save"
        >
          Registrar
        </button>
      </div>
    </Modal>
  );
}

function VoidDialog({
  charge,
  onClose,
  onDone,
}: {
  charge: AdminCharge;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => admin.voidCharge(charge.id, reason.trim()),
    onSuccess: () => {
      toast.success("Cargo anulado");
      onDone();
      onClose();
    },
    onError: fail,
  });
  return (
    <Modal title="Anular cargo" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        {formatDay(charge.periodStart)} · {usd(charge.amountUsd)}. El periodo se podrá volver a
        cobrar.
      </p>
      <label className="mt-3 grid gap-1 text-sm">
        Motivo
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Fecha equivocada"
          className={field}
        />
      </label>
      <button
        type="button"
        disabled={save.isPending || reason.trim().length < 3}
        onClick={() => save.mutate()}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-destructive/60 text-sm text-destructive disabled:opacity-40"
      >
        Anular
      </button>
    </Modal>
  );
}
