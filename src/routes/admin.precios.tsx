import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, formatMoney, parseMinorInput } from "@/lib/api";
import {
  admin,
  caracasToday,
  CYCLE_LABEL,
  formatDay,
  type Cycle,
  type PaymentDetails,
  type Tier,
} from "@/lib/adminApi";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminHead } from "@/lib/adminHead";

export const Route = createFileRoute("/admin/precios")({
  head: adminHead("Precios"),
  component: () => (
    <AdminShell current="precios">
      {(s) => <Prices canEdit={s.operator.role === "ADMIN"} />}
    </AdminShell>
  ),
});

type PaidTier = Exclude<Tier, "TRIAL">;
const TIERS: PaidTier[] = ["STARTER", "PRO", "ENTERPRISE"];
const CYCLES: Cycle[] = ["MONTHLY", "ANNUAL"];

const field =
  "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring";

/**
 * La lista de precios. Un precio nuevo es una fila nueva con su fecha: lo que
 * ya se cobró no cambia, y un cliente con precio pactado tampoco.
 */
function Prices({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "prices"], queryFn: () => admin.prices() });
  const [tier, setTier] = useState<PaidTier>("STARTER");
  const [cycle, setCycle] = useState<Cycle>("MONTHLY");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(caracasToday());

  const save = useMutation({
    mutationFn: () =>
      admin.setPrice({
        tier,
        billingCycle: cycle,
        amountUsd: parseMinorInput(amount),
        effectiveFrom: from,
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.price.tier} ${CYCLE_LABEL[r.price.billingCycle].toLowerCase()}: ${formatMoney(r.price.amountUsd, "USD")} desde ${formatDay(r.price.effectiveFrom)}`,
      );
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? `${e.code} · ${e.message}` : "No se pudo conectar"),
  });

  const current = query.data?.current ?? [];
  const find = (t: PaidTier, c: Cycle) => current.find((p) => p.tier === t && p.billingCycle === c);

  return (
    <>
      <h1 className="text-3xl">Precios</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        En dólares de referencia. Los restaurantes pagan en bolívares a la tasa del día de pago, o
        en dólares.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3" data-testid="admin-prices">
        {TIERS.map((t) => (
          <section key={t} className="surface p-5">
            <h2 className="text-lg">{t}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {CYCLES.map((c) => {
                const p = find(t, c);
                return (
                  <div key={c} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{CYCLE_LABEL[c]}</dt>
                    <dd className="tabular-nums">
                      {p ? (
                        <>
                          <strong>{formatMoney(p.amountUsd, "USD")}</strong>
                          <span className="block text-right text-[11px] text-muted-foreground">
                            desde {formatDay(p.effectiveFrom)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">sin precio</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>

      {canEdit && (
        <section className="surface mt-6 p-5">
          <h2 className="text-lg">Poner un precio</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-sm">
              Plan
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as PaidTier)}
                className={field}
              >
                {TIERS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Ciclo
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value as Cycle)}
                className={field}
              >
                {CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {CYCLE_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Precio en $
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="29,00"
                className={field}
                data-testid="admin-price-amount"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Desde
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={save.isPending || !amount.trim() || parseMinorInput(amount) === "0"}
            onClick={() => save.mutate()}
            className="btn-primary mt-4"
            data-testid="admin-price-save"
          >
            Guardar precio
          </button>
        </section>
      )}

      {(query.data?.history.length ?? 0) > 0 && (
        <section className="mt-6">
          <h2 className="text-lg">Historial</h2>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {query.data!.history.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span>
                  {p.tier} · {CYCLE_LABEL[p.billingCycle]}
                </span>
                <span className="tabular-nums">
                  {formatMoney(p.amountUsd, "USD")}{" "}
                  <span className="text-muted-foreground">desde {formatDay(p.effectiveFrom)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PaymentDetailsForm canEdit={canEdit} />
    </>
  );
}

const DETAIL_FIELDS: [keyof PaymentDetails, string, string][] = [
  ["holder", "Titular", "Splite C.A."],
  ["idNumber", "RIF / Cédula", "J-12345678-9"],
  ["bankName", "Banco", "Mercantil"],
  ["bankCode", "Código del banco", "0105"],
  ["phone", "Teléfono de Pago Móvil", "0414-0000000"],
  ["accountNumber", "Número de cuenta (transferencias)", "0105-…"],
  ["zelle", "Zelle", "pagos@splite…"],
  ["notes", "Nota para el restaurante", "Indica el nombre del restaurante en el concepto"],
];

/**
 * A dónde pagan los restaurantes. Sale en «Tu suscripción» de cada uno y en
 * los recordatorios: si está vacío, se les dice que se los mandaremos.
 */
function PaymentDetailsForm({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: ["admin", "payment-details"],
    queryFn: () => admin.paymentDetails(),
  });
  const [draft, setDraft] = useState<PaymentDetails | null>(null);
  const current = draft ?? q.data?.paymentDetails ?? null;
  const save = useMutation({
    mutationFn: (d: PaymentDetails) => admin.setPaymentDetails(d),
    onSuccess: () => {
      toast.success("Datos de cobro guardados");
      setDraft(null);
      void q.refetch();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? `${e.code} · ${e.message}` : "No se pudo conectar"),
  });
  if (!current) return null;
  return (
    <section className="surface mt-6 p-5" data-testid="admin-payment-details">
      <h2 className="text-lg">Datos de cobro de Splite</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Lo que ven los restaurantes para pagarte, en su panel y en los recordatorios.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {DETAIL_FIELDS.map(([key, label, placeholder]) => (
          <label key={key} className="grid gap-1 text-sm">
            {label}
            <input
              value={current[key] ?? ""}
              disabled={!canEdit}
              onChange={(e) => setDraft({ ...current, [key]: e.target.value })}
              placeholder={placeholder}
              className={field}
              data-testid={`admin-pd-${key}`}
            />
          </label>
        ))}
      </div>
      {canEdit && (
        <button
          type="button"
          disabled={save.isPending || !draft}
          onClick={() => draft && save.mutate(draft)}
          className="btn-primary mt-4"
          data-testid="admin-pd-save"
        >
          Guardar datos de cobro
        </button>
      )}
    </section>
  );
}
