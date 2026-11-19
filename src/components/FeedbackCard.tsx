import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { feedback } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/dates";

/**
 * Lo que dicen los comensales después de pagar (R20), en el panel del dueño y
 * del encargado: la media de los últimos 30 días y los últimos comentarios.
 *
 * Al final de la columna de contexto y no arriba: no pide nada en el turno,
 * se lee con calma. Sin opiniones todavía, dice cómo llegan en vez de un 0
 * que parecería la peor nota posible.
 */
export function FeedbackCard() {
  const { t, lang } = useI18n();
  const query = useQuery({
    queryKey: ["feedback", 30],
    queryFn: () => feedback.summary(30),
    retry: false,
    staleTime: 60_000,
  });
  if (!query.data) return null;
  const { average, count, recent } = query.data;
  const withComments = recent.filter((r) => r.comment).slice(0, 3);

  return (
    <section className="surface p-5" data-testid="feedback-card" aria-labelledby="feedback-heading">
      <p id="feedback-heading" className="eyebrow">
        {t("feedbackTitle")}
      </p>
      {count === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("feedbackEmpty")}</p>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="money-md">
              {average?.toLocaleString(lang === "en" ? "en" : "es-VE")}
            </span>
            <Star aria-hidden className="h-4 w-4 self-center fill-amber-400 text-amber-500" />
            <span className="text-sm text-muted-foreground">
              {t("feedbackCount").replace("{n}", String(count))}
            </span>
          </p>
          {withComments.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {withComments.map((r) => (
                <li key={r.id} className="text-sm">
                  <p className="text-xs text-muted-foreground">
                    {"★".repeat(r.rating)}
                    {r.tableName ? ` · ${t("receiptTable")} ${r.tableName}` : ""} ·{" "}
                    {formatDateTime(r.createdAt, lang)}
                  </p>
                  <p className="mt-0.5">{r.comment}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
