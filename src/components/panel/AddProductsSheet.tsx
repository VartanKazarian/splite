import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Minus, Plus, Search } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { API_BASE_URL, formatMinor, formatMoney, type Product } from "@/lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Elegir lo que se pide en una mesa.
 *
 * Era un diálogo con una lista de una columna: nombre, precio y dos botones
 * de 26 px para subir y bajar la cantidad, con `max-h-[46vh]` de alto útil.
 * En un teléfono eso son cuatro platos y medio a la vista de una carta de
 * treinta, y ningún dato que no sea texto -- así que para encontrar la cachapa
 * había que leerse la carta entera, de pie, al lado de la mesa.
 *
 * Aquí es una hoja de 90 vh con una rejilla de dos columnas: la foto del plato
 * (que ya se sube desde la carta y hasta ahora no se veía en ninguna otra
 * pantalla), el nombre y el precio. Se reconoce por la foto antes de leer el
 * nombre, que es como se busca algo en una carta de verdad.
 *
 * **El carrito es local a propósito.** Tocar una tarjeta suma uno aquí y no
 * manda nada; el pie es el que envía todo junto. Ir al servidor por cada toque
 * convertiría "tres tequeños y dos cachapas" en cinco llamadas que pueden
 * fallar por la mitad y dejar la cuenta a medias -- y el endpoint acepta el
 * lote entero en una transacción justamente para que no pase. De paso, mientras
 * no se envíe, el paso de cantidad de la propia tarjeta es el "deshacer": no
 * hace falta ni un aviso flotante con cuenta atrás ni una operación que
 * revierta nada.
 *
 * Las categorías filtran; no agrupan. Agrupadas, la rejilla se rompe en tantos
 * bloques como secciones tenga la carta y desaparece la ventaja de ver muchas
 * a la vez.
 */
export function AddProductsSheet({
  open,
  onOpenChange,
  products,
  billCurrency,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  billCurrency: string;
  pending: boolean;
  onConfirm: (lines: { productId: string; quantity: number }[]) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});

  // Cada vez que se abre se empieza de cero: un carrito heredado de la mesa
  // anterior se cobraría en ésta.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setCategory(null);
      setQty({});
    }
  }, [open]);

  const active = useMemo(() => products.filter((p) => p.active), [products]);

  // El hueco de la foto sólo existe si hay fotos que enseñar.
  //
  // En la carta, el hueco vacío de 36 px se reserva siempre a propósito: es lo
  // que mantiene alineados los nombres y recuerda qué plato falta por
  // fotografiar. Aquí ocupa la mitad de la tarjeta, y una carta sin fotos -- que
  // es el estado normal de una carta recién montada -- quedaba en una rejilla de
  // cajas grises con un icono repetido, viendo menos platos por pantalla que la
  // lista que sustituye. Con fotos manda la foto; sin ninguna, mandan los
  // nombres. Es todo o nada y no plato a plato: alturas distintas en la misma
  // fila y la rejilla deja de leerse en columnas.
  const withPhotos = useMemo(() => active.some((p) => p.imageUrl), [active]);

  // Sólo las secciones que tienen algo que enseñar. Una carta con secciones
  // vacías llenaba la fila de fichas que no filtraban nada.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of active) {
      if (p.categoryId && p.categoryName && !seen.has(p.categoryId)) {
        seen.set(p.categoryId, p.categoryName);
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [active]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active
      .filter((p) => (category ? p.categoryId === category : true))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [active, category, query]);

  const chosen = Object.entries(qty).filter(([, n]) => n > 0);
  const units = chosen.reduce((a, [, n]) => a + n, 0);
  const total = chosen.reduce((sum, [id, n]) => {
    const p = products.find((x) => x.id === id);
    return p ? sum + BigInt(p.priceMinorUnits) * BigInt(n) : sum;
  }, 0n);

  const bump = (id: string, delta: number) =>
    setQty((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[90vh] flex-col gap-0 p-0">
        <SheetHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 text-left">
          <SheetTitle>{t("chooseProducts")}</SheetTitle>

          <div className="relative mt-3">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchProduct")}
              aria-label={t("searchProduct")}
              className="min-h-11 w-full rounded-lg border border-input bg-secondary pl-9 pr-3 text-base outline-none focus:border-ring"
            />
          </div>

          {categories.length > 0 && (
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ id: null, name: t("filterAllSections") }, ...categories].map((c) => (
                <button
                  key={c.id ?? "all"}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                  className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors ${
                    category === c.id
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {list.map((p) => {
                // Un plato en dólares no entra en una cuenta en bolívares: el
                // servidor lo rechaza, así que aquí ni se ofrece.
                const mismatch = p.currency !== billCurrency;
                const n = qty[p.id] ?? 0;
                return (
                  <li key={p.id}>
                    <div
                      className={`flex h-full flex-col overflow-hidden rounded-xl border transition-colors ${
                        n > 0 ? "border-primary bg-primary/5" : "border-border"
                      } ${mismatch ? "opacity-40" : ""}`}
                    >
                      {/* Toda la tarjeta suma uno. El paso fino -- quitar, o
                          seguir sumando de uno en uno -- sale sólo cuando ya
                          hay algo elegido, que es cuando hace falta. */}
                      <button
                        type="button"
                        disabled={mismatch}
                        onClick={() => bump(p.id, 1)}
                        className="flex flex-1 flex-col text-left disabled:cursor-not-allowed"
                      >
                        {withPhotos &&
                          (p.imageUrl ? (
                            <img
                              src={`${API_BASE_URL}${p.imageUrl}`}
                              alt=""
                              loading="lazy"
                              className="aspect-[4/3] w-full object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="flex aspect-[4/3] w-full items-center justify-center bg-secondary text-muted-foreground/40"
                            >
                              <ImageIcon className="h-6 w-6" />
                            </span>
                          ))}
                        <span className="flex flex-1 flex-col gap-0.5 p-3">
                          <span className="line-clamp-2 text-[13px] leading-tight">{p.name}</span>
                          <span className="money-sm mt-auto text-muted-foreground">
                            {mismatch
                              ? `${p.currency} ${formatMinor(p.priceMinorUnits)}`
                              : formatMoney(p.priceMinorUnits, p.currency)}
                          </span>
                        </span>
                      </button>

                      {n > 0 && (
                        <div className="flex items-center justify-between border-t border-primary/30 px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => bump(p.id, -1)}
                            aria-label={`${t("oneLessOf")} ${p.name}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="figure text-sm font-medium">{n}</span>
                          <button
                            type="button"
                            onClick={() => bump(p.id, 1)}
                            aria-label={`${t("oneMoreOf")} ${p.name}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* El pie manda el lote entero. Con el carrito vacío sigue ahí, en
            gris: que aparezca y desaparezca mueve la rejilla justo cuando se
            está tocando. */}
        <div className="shrink-0 border-t border-border px-4 pb-4 pt-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {units === 1 ? t("cartUnitsOne") : t("cartUnits").replace("{n}", String(units))}
            </span>
            {units > 0 && <span className="money-md">{formatMoney(total.toString(), "VES")}</span>}
          </div>
          <button
            type="button"
            disabled={pending || units === 0}
            onClick={() =>
              onConfirm(chosen.map(([productId, quantity]) => ({ productId, quantity })))
            }
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> {pending ? t("loading") : t("addSelected")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
