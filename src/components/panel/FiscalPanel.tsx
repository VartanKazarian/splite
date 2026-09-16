import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HelpCircle, RefreshCw } from "lucide-react";

import { fiscalInvoices, formatMoney, type FiscalRequestRow } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/dates";
import { FiscalInvoiceSheet } from "@/components/panel/FiscalInvoiceSheet";

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

  /*
   * Cuántas se piden. Sube de 25 en 25 con «ver más» en vez de paginar: un
   * restaurante que busca una factura concreta la busca por fecha bajando, no
   * saltando a la página 4, y una lista que se alarga conserva lo que ya estaba
   * leyendo en pantalla.
   */
  const [limit, setLimit] = useState(25);
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);

  const issued = useQuery({
    queryKey: ["fiscal", "invoices", limit],
    queryFn: () => fiscalInvoices.list({ limit }),
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
              <li key={inv.id}>
                {/*
                  La fila entera abre la factura. Antes no había forma de abrir
                  ninguna: el detalle existía en la API y no lo llamaba nadie,
                  así que las líneas, el desglose por alícuota y el envío eran
                  inalcanzables desde la pantalla.
                */}
                <button
                  type="button"
                  onClick={() => setOpenInvoice(inv.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    {/* El número de control lo pone la imprenta autorizada. Se
                        muestra tal cual, sin adornarlo ni reformatearlo. */}
                    <span className="figure block text-sm">{inv.controlNumber}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDateTime(inv.issuedAt, lang) ?? ""} ·{" "}
                      {inv.customer?.taxId ?? t("fiscalFinalConsumer")}
                    </span>
                  </span>
                  <span className="figure text-sm">{formatMoney(inv.totalMinor, "VES")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Sólo cuando la página vino llena: si vinieron menos de las pedidas,
            no hay más y ofrecer el botón sería prometer una página vacía. */}
        {(issued.data?.data.length ?? 0) >= limit ? (
          <button
            type="button"
            className="mt-3 min-h-[44px] w-full rounded-lg border border-border text-sm transition-colors hover:bg-muted disabled:opacity-40"
            disabled={issued.isFetching}
            onClick={() => setLimit((n) => n + 25)}
          >
            {issued.isFetching ? t("loading") : t("fiscalLoadMore")}
          </button>
        ) : null}
      </section>

      <FiscalInvoiceSheet
        invoiceId={openInvoice}
        onOpenChange={(open) => {
          if (!open) setOpenInvoice(null);
        }}
      />
    </div>
  );
}
