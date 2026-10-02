import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, Send, ShoppingBag } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  formatMoney,
  guest,
  guestSession,
  type PublicMenu,
  type PublicProduct,
} from "@/lib/api";
import { vesEquivalent } from "@/lib/menu-price";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Una barra pegada abajo, y el hueco que se reserva para ella.
 *
 * Fija quiere decir fuera del flujo, así que no empuja nada: la carta seguía
 * midiendo lo mismo con barra que sin ella y la barra se echaba encima del
 * final. Medido en un teléfono de 393x852 con la carta hasta el fondo: 109 px
 * de barra sobre 40 px de respiro, y el botón "Añadir" del último plato --
 * Papelón con limón -- quedaba **entero** debajo. El último plato de la carta
 * no se podía pedir.
 *
 * El hueco se mide de la propia barra en vez de escribir su altura a mano
 * porque esa altura cambia sola: la fila de unidades aparece y desaparece, y
 * un error de envío añade otra línea. Un número fijo acierta hoy y vuelve a
 * tapar el último plato la primera vez que alguien toque el contenido.
 */
export function FixedBottomBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* El hueco. Va antes para quedarse al final del flujo de la página. */}
      <div aria-hidden style={{ height }} />
      <div
        ref={ref}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur"
      >
        {children}
      </div>
    </>
  );
}

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
 * **No envía: abre el pedido.** Enviaba directamente, y lo elegido estaba
 * repartido por toda la carta -- un 1 en un plato de arriba, un 2 en otro de
 * abajo --, así que se mandaba a la cocina algo que nadie había visto junto.
 * Ahora la barra abre una hoja con lo elegido, las cantidades, el total y una
 * nota para el personal, y desde ahí se envía.
 *
 * **La sesión se acuña al enviar.** Leer la carta no abre ninguna -- el código
 * se resuelve con `POST /guest/qr/context`, sin gastar sesión -- así que quien
 * sólo mira no deja nada abierto. Y se acuña en el manejador del clic y no en
 * un efecto, por lo mismo que en `TableLanding`: un clic ocurre una vez y un
 * efecto las que React decida, y ahí se midieron dos sesiones por pulsación.
 */
export function GuestOrderBar({
  quantities,
  products,
  qrToken,
  bump,
  rate,
  onSent,
}: {
  quantities: Record<string, number>;
  products: PublicProduct[];
  /** Para acuñar la sesión si todavía no hay. Sin él no se puede pedir. */
  qrToken: string | null;
  /** Cambiar una cantidad desde la hoja, igual que desde la carta. */
  bump: (productId: string, delta: number) => void;
  /** La tasa de la carta, para el total en bolívares. */
  rate?: PublicMenu["rate"];
  onSent: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const chosen = Object.entries(quantities).filter(([, n]) => n > 0);
  const lines = chosen
    .map(([id, quantity]) => ({ product: products.find((p) => p.id === id), quantity }))
    .filter((line): line is { product: PublicProduct; quantity: number } => Boolean(line.product));
  const units = chosen.reduce((a, [, n]) => a + n, 0);
  const total = lines.reduce(
    (sum, { product, quantity }) => sum + BigInt(product.priceMinorUnits) * BigInt(quantity),
    0n,
  );
  const currency = products[0]?.currency ?? "VES";
  const totalVes = vesEquivalent(total.toString(), rate);

  const send = useMutation({
    mutationFn: async () => {
      if (!guestSession.get()) {
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
      return guest.order(
        chosen.map(([productId, quantity]) => ({ productId, quantity })),
        note,
      );
    },
    onSuccess: () => {
      setOpen(false);
      setNote("");
      onSent();
    },
  });

  // Si se quita lo último desde la hoja, la hoja no tiene nada que enseñar.
  useEffect(() => {
    if (units === 0) setOpen(false);
  }, [units]);

  if (units === 0) return null;

  return (
    <>
      <FixedBottomBar>
        <div className="mx-auto w-full max-w-md px-5 pb-5 pt-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {units === 1 ? t("cartUnitsOne") : t("cartUnits").replace("{n}", String(units))}
            </span>
            <span className="money-md">{formatMoney(total.toString(), currency)}</span>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="btn-primary w-full">
            <ShoppingBag aria-hidden className="h-4 w-4" />
            {t("guestReviewOrder")}
          </button>
        </div>
      </FixedBottomBar>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[90vh] max-w-md overflow-y-auto rounded-t-2xl px-5 pb-0"
        >
          <SheetHeader className="pr-10 text-left">
            <SheetTitle>{t("guestReviewTitle")}</SheetTitle>
            <SheetDescription>{t("guestReviewHint")}</SheetDescription>
          </SheetHeader>

          <ul className="mt-4 divide-y divide-border">
            {lines.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{product.name}</span>
                  <span className="money-sm block text-muted-foreground">
                    {formatMoney(
                      (BigInt(product.priceMinorUnits) * BigInt(quantity)).toString(),
                      product.currency,
                    )}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border">
                  <button
                    type="button"
                    onClick={() => bump(product.id, -1)}
                    aria-label={`${t("oneLessOf")} ${product.name}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                  >
                    <Minus aria-hidden className="h-4 w-4" />
                  </button>
                  <span className="figure w-6 text-center text-sm font-medium">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => bump(product.id, 1)}
                    aria-label={`${t("oneMoreOf")} ${product.name}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                  >
                    <Plus aria-hidden className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm font-medium">{t("guestOrderTotal")}</span>
            <span className="text-right">
              <span className="money-md block">{formatMoney(total.toString(), currency)}</span>
              {totalVes && (
                <span className="block text-xs text-muted-foreground figure">
                  {t("approxVes").replace("{amount}", formatMoney(totalVes, "VES"))}
                </span>
              )}
            </span>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="guest-order-note" className="text-sm font-medium">
                {t("guestNoteLabel")}
              </label>
              <span className="text-xs text-muted-foreground figure">{note.length}/200</span>
            </div>
            <textarea
              id="guest-order-note"
              value={note}
              maxLength={200}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("guestNotePlaceholder")}
              className="mt-1.5 w-full resize-none rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
            />
          </div>

          <div className="sticky bottom-0 -mx-5 mt-4 space-y-2 border-t border-border bg-background px-5 py-4">
            {send.isError && (
              <p role="alert" className="text-xs text-destructive">
                {send.error instanceof ApiError && send.error.code === "PRODUCT_INACTIVE"
                  ? t("guestOrderGone")
                  : t("guestOrderFailed")}
              </p>
            )}
            <button
              type="button"
              data-testid="guest-send-order"
              disabled={send.isPending}
              onClick={() => send.mutate()}
              className="btn-primary w-full"
            >
              <Send aria-hidden className="h-4 w-4" />
              {send.isPending ? t("loading") : t("guestSendOrder")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full text-sm text-muted-foreground hover:text-foreground"
            >
              {t("guestKeepBrowsing")}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
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
      <p className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Check aria-hidden className="h-5 w-5 text-primary" />
        {t("guestOrderSent")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t("guestOrderSentBody")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onMenu} className="btn-choice min-h-11 px-4 text-sm">
          {t("guestOrderMore")}
        </button>
        <button type="button" onClick={onBill} className="btn-choice min-h-11 px-4 text-sm">
          {t("yourBill")}
        </button>
      </div>
    </div>
  );
}
