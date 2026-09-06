import { useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";

import { formatBps, formatMoney, payments } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/**
 * Lo que ha ganado en propinas quien está mirando.
 *
 * Distinto del informe del restaurante: ese es de dueño y encargado y enseña a
 * todo el mundo; éste es de cualquiera y enseña sólo lo suyo. Un mesero no
 * tiene por qué pedirle a nadie que le mire cuánto lleva.
 */
export function MyTipsCard({ from, to }: { from: string; to: string }) {
  const { t, plural } = useI18n();
  const mine = useQuery({
    queryKey: ["my-tips", from, to],
    queryFn: () => payments.myTips(from, to),
    retry: false,
  });

  if (mine.isLoading) {
    return (
      <section className="surface mt-4 p-6">
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </section>
    );
  }

  if (mine.isError) {
    // No es una pantalla crítica: si falla, se calla en vez de tapar el resto.
    // El código del error se queda fuera: a un mesero mirando lo que ha ganado
    // no le sirve de nada, y sigue estando en la respuesta y en los registros.
    return (
      <section className="surface mt-4 p-6">
        <h2 className="inline-flex items-center gap-2 text-xl">
          <HandCoins className="h-5 w-5 text-muted-foreground" /> {t("myTips")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("myTipsFailed")}</p>
      </section>
    );
  }

  const d = mine.data!;

  return (
    <section className="surface mt-4 p-6">
      <h2 className="inline-flex items-center gap-2 text-xl">
        <HandCoins className="h-5 w-5 text-muted-foreground" /> {t("myTips")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("myTipsSub")}</p>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{t("myTipsAmount")}</dt>
          <dd className="money-lg mt-1">{formatMoney(d.tipsVes, "VES")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("myTipsBilled")}</dt>
          <dd className="money-md mt-1">{formatMoney(d.billedVes, "VES")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("myTipsRate")}</dt>
          <dd className="mt-1">{formatBps(d.tipRateBps)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("bill_other")}</dt>
          <dd className="mt-1">
            {d.bills} {plural(d.bills, "bill")} · {d.payments} {plural(d.payments, "payment")}
          </dd>
        </div>
      </dl>

      {BigInt(d.tipsVes) === 0n && (
        <p className="mt-3 text-xs text-muted-foreground">{t("myTipsEmpty")}</p>
      )}
    </section>
  );
}
