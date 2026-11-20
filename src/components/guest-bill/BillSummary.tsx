import { useI18n } from "@/lib/i18n";
import { formatBps, formatMoney, type Bill, type MenuCurrency } from "@/lib/api";
import { groupLines, toVes } from "@/components/guest-bill/helpers";
import { formatRate } from "@/lib/menu-price";
import "@/lib/i18n-guest";

/** La tarjeta de la cuenta: las líneas, los impuestos y la cifra que se paga. */
export function BillSummary({
  bill,
  hidden,
  showVes,
  rateStr,
  billIsEmpty,
  partlyPaid,
  paidSoFar,
}: {
  bill: Bill;
  /** Fuera del paso 1 la cuenta no se ve (salvo sin nada que pagar). */
  hidden: boolean;
  showVes: boolean;
  rateStr: string | null;
  billIsEmpty: boolean;
  partlyPaid: boolean;
  paidSoFar: bigint;
}) {
  const { t } = useI18n();
  return (
    <div className={`surface p-6 ${hidden ? "hidden" : ""}`}>
      <h1 className="text-3xl">{t("yourBill")}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("quotedIn")} {t(`currency${bill.currency}` as never)}
      </p>

      {/* La lista trae su propia línea superior y su relleno, así que sin
          productos quedaban dos separadores seguidos con un hueco en medio y
          nada dentro. Una cuenta sin líneas no dibuja la lista. */}
      {(bill.items ?? []).length > 0 && (
        <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          {groupLines(bill.items ?? []).map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
              </span>
              {/* El bolívar debajo del dólar y no al lado. Al lado tenía un
                  ancho fijo de 96 px, que un importe de siete dígitos
                  desborda, y era el único número de la fila que no llevaba
                  la cara de cifras -- salía en DM Sans, sin tabular. */}
              <span className="flex shrink-0 flex-col items-end">
                <span className="money-md">{formatMoney(item.subtotalMinor, bill.currency)}</span>
                {showVes && (
                  <span className="money-sm text-muted-foreground">
                    {formatMoney(toVes(item.subtotalMinor, rateStr), "VES")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Sin nada en la cuenta, cuatro filas de ceros no informan de nada:
          el mensaje de abajo ya dice lo que pasa. */}
      <div
        className={`mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground ${
          billIsEmpty ? "hidden" : ""
        }`}
      >
        <MoneyRow label={t("subtotal")} amount={bill.subtotalMinor} currency={bill.currency} />
        <MoneyRow
          label={`${t("iva")} ${formatBps(bill.vatBps)}`}
          amount={bill.vatMinor}
          currency={bill.currency}
        />
        <MoneyRow
          label={`${t("service")} ${formatBps(bill.serviceChargeBps)}`}
          amount={bill.serviceChargeMinor}
          currency={bill.currency}
        />
      </div>

      {/* Un total, no dos, y la cifra grande es la que se paga ahora.
          Había dos: "Total" en la moneda de la carta a 36 px y, debajo,
          "Total a pagar" en bolívares a 30. El mismo importe dos veces,
          compitiendo -- y el grande era el que nadie paga. Quien mira esto
          va a transferir bolívares desde su banco.
          Con cobros parciales, lo que se paga ya no es el total sino lo que
          queda, así que la cifra grande es esa y el total baja a fila de
          apoyo. Una sola de 32 px por tarjeta: si el total y el pendiente
          fueran los dos grandes, volveríamos a tener dos importes
          disputándose la mirada.
          El rótulo va encima y no al lado, así el importe dispone de los
          305 px de la tarjeta enteros y no se parte. Con la carta en
          bolívares no hay conversión: ni subtítulo ni tasa -- enseñaba una
          tasa de 1, que no significa nada. */}
      <div
        className={`mt-4 flex flex-col gap-0.5 border-t border-border pt-4 ${
          billIsEmpty ? "hidden" : ""
        }`}
      >
        <span className="eyebrow">{partlyPaid ? t("outstanding") : t("totalPayable")}</span>
        <span className="money-xl">
          {formatMoney(partlyPaid ? bill.remainingVes : bill.totalDueVes, "VES")}
        </span>

        {/* Con cobros hechos, quien llega el tercero necesita dos cifras: lo
            que queda, para saber cuánto puede pagar, y lo que era la cuenta,
            para entender por qué no coincide con lo que vio en la mesa. La
            original va tachada -- tachado es lo ya cobrado -- y en pequeño,
            porque no es la que se paga. */}
        {partlyPaid && (
          <>
            <span className="mt-1 text-[12px] text-muted-foreground">
              {t("billWas").replace("{amount}", formatMoney(bill.totalDueVes ?? "0", "VES"))}
            </span>
            <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${
                    (Number(paidSoFar) / Math.max(1, Number(BigInt(bill.totalDueVes ?? "0")))) * 100
                  }%`,
                }}
              />
            </div>
          </>
        )}

        {/* El equivalente en la moneda de la carta acompaña al total, no al
            pendiente: convertir un saldo parcial a dólares es un número que
            no aparece en ninguna parte y que nadie va a comprobar. */}
        {bill.currency !== "VES" && !partlyPaid && (
          <span className="money-md text-muted-foreground">
            {formatMoney(bill.totalDue, bill.currency)}
          </span>
        )}
        {bill.currency !== "VES" && (bill.fxRateVesPerUnit ?? bill.fxRate) && (
          <span className="money-sm mt-1 text-muted-foreground">
            {t("bcvRate")} {formatRate(bill.fxRateVesPerUnit ?? bill.fxRate!)}
          </span>
        )}
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: string;
  currency: MenuCurrency;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="money-md">{formatMoney(amount, currency)}</span>
    </div>
  );
}

/**
 * Pagada, vacía, o con productos que no suman nada. Las tres se quedan sin
 * división y sin cobro, y las tres decían lo mismo.
 *
 * Una cuenta recién abierta no tiene nada, y es justo cuando más gente
 * escanea: te sientas, ves el código y lo pruebas antes de que el mesero haya
 * metido nada. Ofrecer "Pagar todo" y las tres formas de dividir sobre cero
 * terminaba en un aviso rojo con un código de la API --
 * SPLIT_NOTHING_OUTSTANDING -- que además decía que la cuenta ya estaba
 * pagada. No lo estaba: estaba vacía.
 */
export function NothingToPay({
  bill,
  settled,
  billIsEmpty,
  onBack,
}: {
  bill: Bill;
  settled: boolean;
  billIsEmpty: boolean;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="surface mt-4 p-6">
      <h2 className="text-xl">
        {settled ? t("billSettledTitle") : billIsEmpty ? t("billEmptyTitle") : t("nothingDue")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {settled
          ? `${t("billSettledBody")} ${formatMoney(bill.amountPaidVes ?? "0", "VES")}.`
          : billIsEmpty
            ? t("billEmptyBody")
            : t("nothingDueBody")}
      </p>
      {/* "Mientras tanto, mira la carta" sólo tiene sentido mientras se
          espera algo. Para una cuenta pagada no hay mientras tanto. */}
      {onBack && (
        <button onClick={onBack} className="mt-4 text-sm underline underline-offset-2">
          {billIsEmpty ? t("billEmptyMenu") : t("theMenu")}
        </button>
      )}
    </div>
  );
}
