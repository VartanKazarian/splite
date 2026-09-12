import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HelpCircle, RefreshCw } from "lucide-react";

import { fiscalInvoices, formatMoney, type FiscalRequestRow } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/dates";

/**
 * Facturación, para el restaurante.
 *
 * Dos listas, y el orden entre ellas importa: **primero lo que está en duda.**
 *
 * `UNCERTAIN` significa que la imprenta contestó algo que no dice si emitió.
 * Nadie debe reintentar eso a ciegas -- una factura duplicada no se puede
 * borrar y ya está declarada --, así que la única acción que ofrece esta
 * pantalla es *preguntar*. El botón se llama «Consultar» y no «Reintentar»
 * porque eso es literalmente lo que hace.
 *
 * Las facturas emitidas van debajo, en frío. Son un registro y no una bandeja
 * de trabajo.
 */
export function FiscalPanel() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();

  const queue = useQuery({
    queryKey: ["fiscal", "queue"],
    queryFn: () => fiscalInvoices.requests({ status: "UNCERTAIN", limit: 50 }),
  });

  const issued = useQuery({
    queryKey: ["fiscal", "invoices"],
    queryFn: () => fiscalInvoices.list({ limit: 25 }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => fiscalInvoices.resolve(id),
    onSuccess: (data) => {
      if (data.status === "ISSUED") toast.success(t("fiscalResolvedIssued"));
      else if (data.stillUnknown) toast.message(t("fiscalStillUnknown"));
      else toast.message(t("fiscalResolvedFailed"));
      qc.invalidateQueries({ queryKey: ["fiscal"] });
    },
    onError: () => toast.error(t("fiscalResolveFailed")),
  });

  const pending = queue.data?.data ?? [];

  return (
    <div className="mt-6 space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">{t("fiscalQueueTitle")}</h2>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => qc.invalidateQueries({ queryKey: ["fiscal"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("refreshRates")}
          </button>
        </div>

        {/* La explicación va en la pantalla y no en un manual: quien abre esto
            necesita saber por qué no hay un botón de reintentar. */}
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("fiscalQueueHelp")}
        </p>

        {queue.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : pending.length === 0 ? (
          // El estado normal, y se escribe como tal: nada pendiente es una
          // buena noticia, no una tabla vacía.
          <p className="mt-4 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            {t("fiscalQueueEmpty")}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pending.map((row: FiscalRequestRow) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    {t("fiscalAttemptFrom").replace(
                      "{when}",
                      formatDateTime(row.createdAt, lang) ?? "",
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("fiscalAttempts").replace("{n}", String(row.attempts))}
                    {row.lastErrorCode ? ` · ${row.lastErrorCode}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(row.id)}
                >
                  {t("fiscalAsk")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl">{t("fiscalIssuedTitle")}</h2>
        {issued.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : (issued.data?.data.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            {t("fiscalIssuedEmpty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {issued.data?.data.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  {/* El número de control lo pone la imprenta autorizada. Se
                      muestra tal cual, sin adornarlo ni reformatearlo. */}
                  <p className="figure text-sm">{inv.controlNumber}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(inv.issuedAt, lang) ?? ""} ·{" "}
                    {inv.customer?.taxId ?? t("fiscalFinalConsumer")}
                  </p>
                </div>
                <span className="figure text-sm">{formatMoney(inv.totalMinor, "VES")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
