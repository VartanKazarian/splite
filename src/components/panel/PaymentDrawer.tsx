import { useEffect, useState } from "react";

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
 * mandar, así que no puede discrepar de lo que se envía.
 *
 * **Lo que sobra.** Teclear más de lo que falta daba
 * `PAYMENT_EXCEEDS_BALANCE`: un error, y a rehacerlo. Pero pagar de más es
 * corriente en una mesa y quiere decir una de dos cosas, y sólo quien está en
 * la caja sabe cuál:
 *
 * - **propina** -- «quédatelo». Va aparte del importe: el servidor guarda
 *   `tipMinorUnits` en su propia columna, la cuenta sólo recibe lo que se le
 *   debía, y el informe de propinas la reparte según el método.
 * - **cambio** -- el cliente da un billete de 20.000 para una cuenta de
 *   16.404,92 y espera 3.595,08 de vuelta. Entonces el cobro es lo que falta y
 *   lo que sobra no es de nadie: es del cliente, y hay que devolvérselo.
 *
 * Así que se pregunta, con la respuesta puesta según cómo entró el dinero:
 * con tarjeta o transferencia no hay vuelto que dar, así que lo de más es
 * propina; en efectivo lo normal es el cambio. Cambiar de método cambia la
 * propuesta mientras nadie la haya tocado -- después manda quien la tocó.
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
  /**
   * El reparto ya hecho: lo que va contra la cuenta y lo que va de propina.
   *
   * Sale de aquí y no del padre porque aquí están las dos cifras con las que se
   * calcula -- lo tecleado y lo pendiente -- y partirlas en dos sitios es la
   * forma de que un día no cuadren.
   */
  onSubmit: (split: { amountMinorUnits: string; tipMinorUnits: string }) => void;
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
  const excess = entered > outstanding ? entered - outstanding : 0n;
  const over = excess > 0n;
  // Contra la cuenta nunca va más de lo que se le debe: el resto es propina o
  // es del cliente, pero de la cuenta no es.
  const toBill = over ? outstanding : entered;
  const after = outstanding - toBill;

  const [overAs, setOverAs] = useState<"TIP" | "CHANGE">("CHANGE");
  const [overTouched, setOverTouched] = useState(false);
  useEffect(() => {
    if (!overTouched) setOverAs(method === "CASH" ? "CHANGE" : "TIP");
  }, [method, overTouched]);
  // Cada cobro empieza limpio: la elección de uno no debe heredarla el
  // siguiente, que puede ser otra mesa y otro cliente.
  useEffect(() => {
    if (!open) setOverTouched(false);
  }, [open]);

  const tip = over && overAs === "TIP" ? excess : 0n;

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
                className="money-lg min-h-14 w-full rounded-xl border border-input bg-secondary px-4 outline-none focus:border-ring"
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
              <span className="money-md shrink-0">{formatMoney(after.toString(), "VES")}</span>
            </div>

            {over && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm text-muted-foreground">
                    {t("tillOverLabel")}
                  </span>
                  <span className="money-md shrink-0">{formatMoney(excess.toString(), "VES")}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["TIP", "CHANGE"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setOverAs(value);
                        setOverTouched(true);
                      }}
                      aria-pressed={overAs === value}
                      className={`min-h-11 rounded-xl border px-2 text-[13px] transition-colors sm:text-sm ${
                        overAs === value
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {value === "TIP" ? t("tillOverAsTip") : t("tillOverAsChange")}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {overAs === "TIP"
                    ? t("tillOverTipNote")
                    : t("tillOverChangeNote").replace(
                        "{amount}",
                        formatMoney(excess.toString(), "VES"),
                      )}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onSubmit({ amountMinorUnits: toBill.toString(), tipMinorUnits: tip.toString() })
            }
            className="min-h-14 w-full rounded-full bg-primary px-6 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? t("loading") : t("registerPayment")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
