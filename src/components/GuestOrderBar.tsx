import { useMutation } from "@tanstack/react-query";
import { Check, Send } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { ApiError, formatMoney, guest, guestSession, type PublicProduct } from "@/lib/api";

/**
 * La barra de "lo que llevo pedido", pegada abajo mientras se lee la carta.
 *
 * Fija y no al final del todo porque una carta mide varias pantallas: un botón
 * de enviar al final obliga a bajar hasta el último plato para mandar algo que
 * se eligió en el primero.
 *
 * **Sólo aparece con algo dentro.** Vacía sería una franja permanente tapando
 * dos platos para decir "cero".
 *
 * **La sesión se acuña aquí, al pulsar.** Leer la carta no abre ninguna -- el
 * código se resuelve con `POST /guest/qr/context`, sin gastar sesión -- así que
 * quien sólo mira no deja nada abierto. Y se acuña en el manejador del clic y
 * no en un efecto, por lo mismo que en `TableLanding`: un clic ocurre una vez y
 * un efecto las que React decida, y ahí se midieron dos sesiones por pulsación.
 */
export function GuestOrderBar({
  quantities,
  products,
  qrToken,
  onSent,
}: {
  quantities: Record<string, number>;
  products: PublicProduct[];
  /** Para acuñar la sesión si todavía no hay. Sin él no se puede pedir. */
  qrToken: string | null;
  onSent: () => void;
}) {
  const { t } = useI18n();

  const chosen = Object.entries(quantities).filter(([, n]) => n > 0);
  const units = chosen.reduce((a, [, n]) => a + n, 0);
  const total = chosen.reduce((sum, [id, n]) => {
    const product = products.find((p) => p.id === id);
    return product ? sum + BigInt(product.priceMinorUnits) * BigInt(n) : sum;
  }, 0n);
  const currency = products[0]?.currency ?? "VES";

  const send = useMutation({
    mutationFn: async () => {
      if (!guestSession.get()) {
        // Sin código no hay con qué acuñar sesión: es el caso de una pestaña
        // que perdió el token, y lo que toca es volver a escanear.
        if (!qrToken) {
          throw new ApiError(401, {
            code: "GUEST_SESSION_MISSING",
            message: "Guest session missing",
            details: {},
            requestId: "",
          });
        }
        await guest.openSession(qrToken);
      }
      return guest.order(chosen.map(([productId, quantity]) => ({ productId, quantity })));
    },
    onSuccess: onSent,
  });

  if (units === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto w-full max-w-md px-5 pb-5 pt-3">
        {send.isError && (
          <p className="mb-2 text-[11px] text-destructive">
            {send.error instanceof ApiError && send.error.code === "PRODUCT_INACTIVE"
              ? t("guestOrderGone")
              : t("guestOrderFailed")}
          </p>
        )}
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {units === 1 ? t("cartUnitsOne") : t("cartUnits").replace("{n}", String(units))}
          </span>
          <span className="money-md">{formatMoney(total.toString(), currency)}</span>
        </div>
        <button
          type="button"
          disabled={send.isPending}
          onClick={() => send.mutate()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send aria-hidden className="h-4 w-4" />
          {send.isPending ? t("loading") : t("guestSendOrder")}
        </button>
      </div>
    </div>
  );
}

/**
 * Lo que se ve después de enviar, y nada más.
 *
 * No hay estados que seguir: lo pedido ya está en la cuenta del comensal, así
 * que la confirmación remata y la propia cuenta es donde se comprueba. Un
 * "preparando / servido" aquí sería inventar una cocina que Splite no gobierna.
 */
export function GuestOrderSent({ onMenu, onBill }: { onMenu: () => void; onBill: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-primary/50 bg-primary/10 p-4">
      <p className="flex items-center gap-2 font-display text-2xl">
        <Check aria-hidden className="h-5 w-5 text-primary" />
        {t("guestOrderSent")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t("guestOrderSentBody")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onMenu}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
        >
          {t("guestOrderMore")}
        </button>
        <button
          type="button"
          onClick={onBill}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
        >
          {t("yourBill")}
        </button>
      </div>
    </div>
  );
}
