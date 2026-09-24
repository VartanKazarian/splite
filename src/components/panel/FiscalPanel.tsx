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

  const refreshButton = (
    <button
      type="button"
      className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => qc.invalidateQueries({ queryKey: ["fiscal"] })}
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      {t("refreshRates")}
    </button>
  );

  /*
   * La cola sólo aparece cuando tiene algo. Vacía -- que es lo normal -- era
   * una sección entera con su explicación encima de las facturas, empujando
   * hacia abajo lo que se viene a buscar. Si hay algo en duda sí va primero:
   * entonces es trabajo, y el registro puede esperar.
   */
  const showQueue = queue.isError || pending.length > 0;

  return (
    <div className="mt-6 space-y-8">
      {showQueue && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl">{t("fiscalQueueTitle")}</h2>
            {refreshButton}
          </div>

          {/* La explicación va en la pantalla y no en un manual: quien abre esto
            necesita saber por qué no hay un botón de reintentar. */}
          <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("fiscalQueueHelp")}
          </p>

          {queue.isError ? (
            <p className="mt-4 rounded-lg border border-border p-4 text-sm text-muted-foreground">
              {t("apiDown")}
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
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl">{t("fiscalIssuedTitle")}</h2>
          {!showQueue && refreshButton}
        </div>
        {/* Lo normal, dicho en una línea y no en una tarjeta: nada en duda. */}
        {!showQueue && queue.isSuccess && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="fiscal-queue-empty">
            {t("fiscalQueueEmpty")}
          </p>
        )}
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
                  data-testid={`fiscal-invoice-row-${inv.id}`}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 p-4 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    {/* Arriba lo que se busca: qué documento y de qué mesa. Los
                        dos números los pone la imprenta autorizada y se muestran
                        tal cual, sin adornarlos ni reformatearlos. */}
                    <span className="block text-sm">
                      {inv.documentType !== "INVOICE" && (
                        <span className="mr-1.5 text-xs text-muted-foreground">
                          {t(
                            inv.documentType === "CREDIT_NOTE"
                              ? "fiscalCreditNote"
                              : "fiscalDebitNote",
                          )}
                        </span>
                      )}
                      <span className="figure font-medium">{inv.documentNumber}</span>
                      {inv.tableName && (
                        <span className="text-muted-foreground"> · {inv.tableName}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      <span className="figure">
                        {t("fiscalControlShort")} {inv.controlNumber}
                      </span>
                      {" · "}
                      {formatDateTime(inv.issuedAt, lang) ?? ""}
                      {" · "}
                      {inv.customer?.name ?? inv.customer?.taxId ?? t("fiscalFinalConsumer")}
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
