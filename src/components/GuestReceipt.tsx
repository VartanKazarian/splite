import { useQuery } from "@tanstack/react-query";

import { guest, formatMoney, type GuestReceipt as Receipt } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/dates";
import { useRememberedPayment } from "@/lib/guest-payment";

/**
 * El recibo: **la cuenta entera de la mesa, y sólo después «tú pagaste X».**
 *
 * El orden es el producto y no la maquetación. Los recibos de una mesa de
 * cuatro tienen que poder ponerse uno al lado del otro y contar la misma cena:
 * mismos productos, mismo subtotal, mismo IVA, mismo total, y como única
 * diferencia el último bloque. Un recibo que enseñara sólo la parte de uno no
 * dejaría comprobar nada -- ni que le cobraron lo que pidió, ni que las partes
 * suman la cuenta -- y es justo lo que la gente hace al salir de un
 * restaurante.
 *
 * Por eso la sección de la cuenta llega del servidor derivada sólo de la
 * cuenta, sin que el pago intervenga, y aquí se pinta tal cual.
 *
 * **No es una factura fiscal**, y la pantalla lo dice con esas palabras al pie
 * en vez de dejar que el aspecto de documento lo insinúe. La factura se pide
 * aparte y la emite una imprenta autorizada.
 */
export function GuestReceipt() {
  const { t, lang } = useI18n();
  const paymentId = useRememberedPayment();

  const query = useQuery({
    queryKey: ["guest-receipt", paymentId],
    queryFn: () => guest.receipt(paymentId as string),
    enabled: Boolean(paymentId),
    retry: false,
  });

  // Sin pago recordado no hay recibo que enseñar, y mientras no se sepa qué
  // dice no se enseña un esqueleto: esto va debajo de todo y no bloquea nada.
  if (!paymentId || query.isPending || query.isError || !query.data) return null;

  const receipt: Receipt = query.data;
  const { bill, payment, restaurant, table } = receipt;
  const currency = bill.currency;
  const money = (minor: string) => formatMoney(minor, currency);

  return (
    <section className="surface mt-4 overflow-hidden p-0" aria-label={t("receiptTitle")}>
      {/* Encabezado: de dónde salió esto. Lo que no se sabe se omite, no se
          rellena con un hueco ni se inventa. */}
      <header className="border-b border-border px-5 py-5">
        <p className="font-display text-xl">{restaurant.name}</p>
        {restaurant.address ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{restaurant.address}</p>
        ) : null}
        {restaurant.rif ? (
          <p className="text-sm text-muted-foreground">RIF {restaurant.rif}</p>
        ) : null}
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <dt>{t("receiptTable")}</dt>
          <dd>{table.name}</dd>
          <dt>{t("receiptBillId")}</dt>
          {/* El identificador completo y no un trozo: es el que se cita para
              reclamar, y medio UUID no sirve para encontrar nada. */}
          <dd className="break-all font-mono">{bill.id}</dd>
          <dt>{t("receiptDate")}</dt>
          <dd>{formatDateTime(payment.declaredAt, lang)}</dd>
        </dl>
      </header>

      {/* LA CUENTA DE LA MESA. Idéntica en el recibo de cada comensal. */}
      <div className="px-5 py-4">
        <p className="eyebrow">{t("receiptProducts")}</p>

        {bill.lines.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("receiptNoLines")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {bill.lines.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{line.name}</p>
                  {/* Cantidad y precio unitario juntos y bajo el nombre: en un
                      teléfono cuatro columnas se aprietan hasta ser ilegibles,
                      y los cuatro datos siguen estando. */}
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {line.quantity} × {money(line.unitPriceMinor)}
                    {line.taxCategory !== "TAXABLE" ? ` · ${t("receiptExempt")}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm tabular-nums">{money(line.subtotalMinor)}</p>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
          <Row label={t("receiptSubtotal")} value={money(bill.subtotalMinor)} />
          {bill.serviceChargeBps > 0 ? (
            <Row
              label={`${t("receiptService")} (${formatBps(bill.serviceChargeBps)})`}
              value={money(bill.serviceChargeMinor)}
            />
          ) : null}
          {/* Una fila por alícuota, con su base. Así se declara y así se lee:
              quien tenga que justificar el gasto necesita la base, no sólo el
              impuesto. Un 0% -- exentos -- también se enseña, porque su base
              forma parte del total. */}
          {bill.taxes.map((tax) => (
            <Row
              key={tax.vatBps}
              label={
                // Un grupo a cero no es «IVA 0,00 %»: eso se lee como si se
                // hubiera aplicado un impuesto nulo. Son los exentos y los no
                // gravados, y su base cuenta igual para el total, así que la
                // fila se queda -- con el nombre correcto.
                tax.vatBps === 0
                  ? `${t("receiptNoVat")} · ${t("receiptBase")} ${money(tax.baseMinor)}`
                  : `${t("receiptVat")} ${formatBps(tax.vatBps)} · ${t("receiptBase")} ${money(tax.baseMinor)}`
              }
              value={money(tax.vatMinor)}
            />
          ))}
        </dl>

        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          {/* Sans y en la escala del dinero. Iba en la serif, que es para los
              nombres y no trae cifras tabulares: el total era el único importe
              del recibo que no alineaba con los de encima. */}
          <p className="text-[15px] font-semibold">{t("receiptBillTotal")}</p>
          <p className="money-lg">{money(bill.totalMinor)}</p>
        </div>
        {currency !== "VES" ? (
          // Una carta en divisa se cobra igualmente en bolívares, a la tasa
          // congelada al abrir la cuenta. Sin esta línea el total impreso no es
          // el que salió de la cuenta bancaria.
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {t("receiptChargedVes").replace("{amount}", formatMoney(bill.totalVes, "VES"))}
          </p>
        ) : null}
      </div>

      {/* TU PAGO. El único bloque que distingue este recibo del de al lado. */}
      <div className="border-t border-border bg-muted/40 px-5 py-4">
        {/* Con rótulo, como «PRODUCTOS». Sin él los dos bloques se leen como una
            sola columna de cifras y se pierde lo único que este formato existe
            para decir: arriba la cuenta de la mesa, aquí lo que puso uno. */}
        <p className="eyebrow">{t("receiptYourPayment")}</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label={t("receiptYouPaid")} value={formatMoney(payment.amountVes, "VES")} strong />
          {payment.tipVes !== "0" ? (
            <>
              <Row label={t("receiptTip")} value={formatMoney(payment.tipVes, "VES")} />
              <Row
                label={t("receiptHandedOver")}
                value={formatMoney(payment.handedOverVes, "VES")}
              />
            </>
          ) : null}
          <Row label={t("receiptMethod")} value={t(`method${payment.method}` as never)} />
          {payment.reference ? (
            <Row label={t("receiptReference")} value={payment.reference} />
          ) : null}
        </dl>
      </div>

      {/*
        El pie que impide el malentendido caro. Un recibo prueba que hubo un
        cobro; no lleva número de control, no lo emite una imprenta autorizada y
        no sirve para desgravar. Decirlo aquí es más barato que descubrirlo
        delante del SENIAT.
      */}
      <p className="hint border-t border-border px-5 py-3">{t("receiptNotFiscal")}</p>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

/** 1600 → "16,00 %". Sin aritmética de coma flotante sobre dinero. */
function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = String(bps % 100).padStart(2, "0");
  return `${whole},${frac} %`;
}
