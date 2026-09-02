import { useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";

import { ApiError, formatBps, formatMoney, payments } from "@/lib/api";

/**
 * Lo que ha ganado en propinas quien está mirando.
 *
 * Distinto del informe del restaurante: ese es de dueño y encargado y enseña a
 * todo el mundo; éste es de cualquiera y enseña sólo lo suyo. Un mesero no
 * tiene por qué pedirle a nadie que le mire cuánto lleva.
 */
export function MyTipsCard({ from, to }: { from: string; to: string }) {
  const mine = useQuery({
    queryKey: ["my-tips", from, to],
    queryFn: () => payments.myTips(from, to),
    retry: false,
  });

  if (mine.isLoading) {
    return (
      <section className="surface mt-4 p-6">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </section>
    );
  }

  if (mine.isError) {
    // No es una pantalla crítica: si falla, se calla en vez de tapar el resto.
    const code = mine.error instanceof ApiError ? mine.error.code : null;
    return (
      <section className="surface mt-4 p-6">
        <h2 className="inline-flex items-center gap-2 text-xl">
          <HandCoins className="h-5 w-5 text-muted-foreground" /> Tus propinas
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No se pudieron cargar{code ? ` (${code})` : ""}.
        </p>
      </section>
    );
  }

  const d = mine.data!;

  return (
    <section className="surface mt-4 p-6">
      <h2 className="inline-flex items-center gap-2 text-xl">
        <HandCoins className="h-5 w-5 text-muted-foreground" /> Tus propinas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sólo las tuyas, por las cuentas que atendiste tú.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Propinas</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums">
            {formatMoney(d.tipsVes, "VES")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Facturado</dt>
          <dd className="mt-1">{formatMoney(d.billedVes, "VES")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sobre lo facturado</dt>
          <dd className="mt-1">{formatBps(d.tipRateBps)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cuentas</dt>
          <dd className="mt-1">
            {d.bills} · {d.payments} cobro(s)
          </dd>
        </div>
      </dl>

      {BigInt(d.tipsVes) === 0n && (
        <p className="mt-3 text-xs text-muted-foreground">
          Sin propinas en este periodo. Se cuentan por la persona a la que está asignada la cuenta:
          si atendiste una mesa que abrió otro, pide que te la asignen desde el panel.
        </p>
      )}
    </section>
  );
}
