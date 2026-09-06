import { useI18n } from "@/lib/i18n";
import { formatMinor, formatMoney, parseMinorInput, type TillPaymentMethod } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Cobrar en caja.
 *
 * Es exactamente el mismo cobro que antes: la misma mutación, la misma clave de
 * idempotencia, el mismo `parseMinorInput` y la misma validación. Lo que cambia
 * es dónde ocurre. Estaba al final de un detalle de mesa muy largo, después de
 * las líneas, los totales y la tasa congelada, así que cobrar en un teléfono
 * era bajar hasta el fondo con el cliente delante. Ahora se abre encima.
 *
 * **La cifra de después.** «Pendiente después del pago» se calcula restando lo
 * tecleado a `remainingVes`, y sólo para enseñarlo. Quien manda sigue siendo el
 * servidor: la respuesta del cobro trae `remaining` y es la que se enseña al
 * terminar. Se hace con `BigInt` sobre las mismas unidades menores que se van a
 * mandar, así que no puede discrepar de lo que se envía; y si lo tecleado pasa
 * de lo pendiente se dice, en vez de enseñar un negativo.
 */
export function PaymentDrawer({
  open,
  onOpenChange,
  tableName,
  remainingVes,
  amount,
  onAmountChange,
  method,
  onMethodChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  remainingVes: string;
  amount: string;
  onAmountChange: (value: string) => void;
  method: TillPaymentMethod;
  onMethodChange: (value: TillPaymentMethod) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();

  const digits = parseMinorInput(amount);
  const entered = (() => {
    try {
      return BigInt(digits || "0");
    } catch {
      return 0n;
    }
  })();
  const outstanding = (() => {
    try {
      return BigInt(remainingVes || "0");
    } catch {
      return 0n;
    }
  })();

  // La misma condición que ya tenía el botón: nada tecleado, o cero, o un cobro
  // en vuelo. No se añade ninguna regla nueva.
  const disabled = pending || !amount || entered <= 0n;
  // Pasarse no se puede: el servidor rechaza con PAYMENT_EXCEEDS_BALANCE, no
  // recorta. Así que en ese caso no se enseña un "pendiente después" -- no va a
  // haber después -- sino el aviso de que ese cobro no va a entrar.
  const over = entered > outstanding;
  const after = outstanding - entered;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>
            {t("registerPayment")} · {tableName}
          </SheetTitle>
          <SheetDescription>{t("tillRetrySafe")}</SheetDescription>
        </SheetHeader>

        {/* Sin sangría propia: la hoja ya trae `p-6`, y el `px-4` que
            había aquí encima dejaba el cuerpo 16 px más adentro que su
            propio título. */}
        <div className="mt-5 space-y-5">
          <div>
            <label
              htmlFor="till-amount"
              className="block text-xs uppercase tracking-widest text-muted-foreground"
            >
              {t("howMuchReceived")}
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="till-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="2.500,00"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="figure min-h-14 w-full rounded-xl border border-input bg-secondary px-4 text-2xl outline-none focus:border-ring"
              />
              <span className="shrink-0 text-sm text-muted-foreground">Bs</span>
            </div>

            {/* Rellena la casilla con lo que falta y ya está. No es otro camino
                de cobro: se manda por la misma mutación, con el mismo parseo y
                la misma clave. */}
            <button
              type="button"
              onClick={() => onAmountChange(formatMinor(remainingVes))}
              disabled={outstanding <= 0n}
              className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
            >
              {t("payAll")} · {formatMoney(remainingVes, "VES")}
            </button>
          </div>

          {/* Cómo entró el dinero. No es una etiqueta: el informe de propinas
              reparte por aquí -- efectivo está en caja, tarjeta y transferencia
              se le deben al personal -- y sin esto todo se registraba como pago
              de la app y caía en "sin clasificar". */}
          <fieldset>
            <legend className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("payMethod")}
            </legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["CASH", "CARD", "TRANSFER"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onMethodChange(value)}
                  aria-pressed={method === value}
                  className={`min-h-11 rounded-xl border px-2 text-[13px] transition-colors sm:px-3 sm:text-sm ${
                    method === value
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t(`method${value}` as never)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-border bg-secondary/50 p-4">
            {/* Si algo tiene que partirse aquí, que sea el rótulo: la cifra
                se quedaba en "1.300,00" y un "Bs" suelto debajo. */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm text-muted-foreground">
                {t("pendingAfterPayment")}
              </span>
              <span className="figure shrink-0 whitespace-nowrap text-xl">
                {over ? "—" : formatMoney(after.toString(), "VES")}
              </span>
            </div>
            {over && (
              <p className="mt-2 text-xs text-amber-700">
                {t("tillOverPending").replace("{amount}", formatMoney(remainingVes, "VES"))}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={onSubmit}
            className="min-h-14 w-full rounded-full bg-primary px-6 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? t("loading") : t("registerPayment")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
