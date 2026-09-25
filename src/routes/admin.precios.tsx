import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, formatMoney, parseMinorInput } from "@/lib/api";
import { admin, caracasToday, CYCLE_LABEL, formatDay, type Cycle, type Tier } from "@/lib/adminApi";
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
    </>
  );
}
