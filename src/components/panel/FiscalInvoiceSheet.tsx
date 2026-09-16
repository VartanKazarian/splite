import { useQuery } from "@tanstack/react-query";

import { fiscalInvoices, formatMoney, type FiscalInvoice } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { formatDateTime } from "@/lib/dates";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Una factura emitida, abierta.
 *
 * El listado enseñaba número de control, fecha, cédula y total, y no había
 * forma de abrir ninguna: `fiscalInvoices.get` existía en el cliente y no lo
 * llamaba nadie, así que las líneas, el desglose por alícuota, el receptor y el
 * envío eran inalcanzables desde la pantalla. Eso deja al restaurante sin poder
 * responder las dos preguntas que de verdad le hacen: «¿qué me cobraste?» y
 * «¿por qué no me llegó?».
 *
 * Es una lectura y nada más. **No hay botón de corregir**, y no es un olvido:
 * una factura emitida no se corrige, se compensa con una nota de crédito. La
 * base de datos lo impone con un disparador que rechaza UPDATE y DELETE, así
 * que un botón de editar aquí no podría hacer nada más que fallar.
 */
export function FiscalInvoiceSheet({
  invoiceId,
  onOpenChange,
}: {
  invoiceId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useI18n();

  const query = useQuery({
    queryKey: ["fiscal", "invoice", invoiceId],
    queryFn: () => fiscalInvoices.get(invoiceId as string),
    enabled: Boolean(invoiceId),
  });

  const invoice = query.data;

  return (
    <Sheet open={Boolean(invoiceId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("fiscalInvoiceTitle")}</SheetTitle>
          <SheetDescription>{invoice ? invoice.documentNumber : t("loading")}</SheetDescription>
        </SheetHeader>

        {query.isPending ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("loading")}</p>
        ) : query.isError || !invoice ? (
          <p className="mt-6 text-sm text-destructive">{t("apiDown")}</p>
        ) : (
          <div className="mt-6 space-y-6 text-sm">
            <dl className="space-y-1.5">
              {/* El número de control lo asigna la imprenta autorizada. Se
                  enseña tal cual, sin reformatearlo. */}
              <Row label={t("fiscalControlNumber")} value={invoice.controlNumber} mono />
              <Row label={t("fiscalDocumentNumber")} value={invoice.documentNumber} mono />
              <Row
                label={t("fiscalIssuedAt")}
                value={formatDateTime(invoice.issuedAt, lang) ?? "—"}
              />
              <Row label={t("fiscalProvider")} value={invoice.provider} />
              <Row
                label={t("fiscalRecipient")}
                value={
                  invoice.customer
                    ? [invoice.customer.name, invoice.customer.taxId].filter(Boolean).join(" · ") ||
                      t("fiscalFinalConsumer")
                    : t("fiscalFinalConsumer")
                }
              />
            </dl>

            {/* Cómo se construyeron las líneas. Va explicado y no en jerga:
                es lo que responde «¿por qué pone 0,338 de hamburguesa?». */}
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {t(BASIS_NOTE[invoice.lineBasis])}
            </p>

            <section>
              <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {t("fiscalLines")}
              </h3>
              <ul className="mt-2 divide-y divide-border">
                {(invoice.lines ?? []).map((line) => (
                  <li
                    key={line.position}
                    className="flex items-baseline justify-between gap-4 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{line.description}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {quantity(line.quantityMilli)} × {formatMoney(line.unitPriceMinor, "VES")}
                      </p>
                    </div>
                    <p className="shrink-0 tabular-nums">{formatMoney(line.baseMinor, "VES")}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {t("fiscalTaxes")}
              </h3>
              {/* Una fila por alícuota, con su base: es lo que el documento
                  declara, y lo que hace falta para el libro de ventas. */}
              <dl className="mt-2 space-y-1.5">
                {(invoice.taxes ?? []).map((tax) => (
                  <Row
                    key={`${tax.taxCategory}-${tax.vatBps}`}
                    label={`${tax.vatBps === 0 ? t("fiscalNoVat") : `${t("fiscalVat")} ${rate(tax.vatBps)}`} · ${t("fiscalBase")} ${formatMoney(tax.baseMinor, "VES")}`}
                    value={formatMoney(tax.vatMinor, "VES")}
                  />
                ))}
              </dl>
            </section>

            <dl className="space-y-1.5 border-t border-border pt-4">
              <Row label={t("fiscalSubtotal")} value={formatMoney(invoice.subtotalMinor, "VES")} />
              <Row label={t("fiscalVat")} value={formatMoney(invoice.vatMinor, "VES")} />
              {invoice.serviceMinor !== "0" ? (
                <Row label={t("fiscalService")} value={formatMoney(invoice.serviceMinor, "VES")} />
              ) : null}
              <Row label={t("fiscalTotal")} value={formatMoney(invoice.totalMinor, "VES")} strong />
            </dl>

            <Delivery delivery={invoice.delivery ?? null} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * El envío por correo.
 *
 * Es la pregunta que llega por teléfono -- «no me llegó mi factura» -- y hasta
 * ahora no había pantalla que la contestara. Se enseña el estado, los intentos
 * y el motivo del último fallo, porque no es lo mismo una dirección mal escrita
 * que un proveedor caído: la primera la arregla el restaurante hablando con el
 * cliente, la segunda se arregla sola en el siguiente barrido.
 */
function Delivery({ delivery }: { delivery: FiscalInvoice["delivery"] }) {
  const { t, lang } = useI18n();

  if (!delivery) {
    // Nadie dejó correo. Es el caso mayoritario y se dice como tal, no como un
    // envío pendiente para siempre.
    return (
      <section className="border-t border-border pt-4">
        <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("fiscalDelivery")}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{t("fiscalDeliveryNone")}</p>
      </section>
    );
  }

  const tone =
    delivery.status === "SENT"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : "border-amber-500/40 bg-amber-500/5";

  return (
    <section className="border-t border-border pt-4">
      <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
        {t("fiscalDelivery")}
      </h3>
      <div className={`mt-2 rounded-lg border p-3 ${tone}`}>
        <p className="break-all">{delivery.email}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(DELIVERY_STATUS[delivery.status])}
          {delivery.sentAt ? ` · ${formatDateTime(delivery.sentAt, lang)}` : ""}
          {delivery.attempts > 1
            ? ` · ${t("fiscalDeliveryAttempts").replace("{n}", String(delivery.attempts))}`
            : ""}
        </p>
        {delivery.lastError ? (
          <p className="mt-2 break-words text-xs text-muted-foreground">
            {t("fiscalDeliveryError")}: {delivery.lastError}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`text-right tabular-nums ${strong ? "font-medium" : ""} ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

const BASIS_NOTE: Record<FiscalInvoice["lineBasis"], Key> = {
  ITEMISED: "fiscalBasisItemised",
  PRORATED: "fiscalBasisProrated",
  AGGREGATE: "fiscalBasisAggregate",
};

const DELIVERY_STATUS: Record<"PENDING" | "SENT" | "FAILED", Key> = {
  PENDING: "fiscalDeliveryPending",
  SENT: "fiscalDeliverySent",
  FAILED: "fiscalDeliveryFailed",
};

/** 2000 milésimas -> "2"; 338 -> "0,338". Prorratear da fracciones de plato. */
function quantity(milli: string): string {
  const n = BigInt(milli);
  if (n % 1000n === 0n) return (n / 1000n).toString();
  return `${n / 1000n},${(n % 1000n).toString().padStart(3, "0")}`;
}

/** 1600 -> "16,00 %". */
function rate(bps: number): string {
  return `${Math.trunc(bps / 100)},${String(bps % 100).padStart(2, "0")} %`;
}
