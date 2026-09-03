import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { API_BASE_URL, formatMoney, menu, type PublicMenu, type PublicProduct } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

/**
 * La carta, tal y como la lee un comensal sentado en la mesa.
 *
 * Sin sesión y sin login: el endpoint público sólo necesita el id del
 * restaurante, que la pantalla anterior ya resolvió a partir del QR.
 *
 * Se lee **por secciones, de izquierda a derecha**, no como una lista larga.
 * Una carta es entradas, principales, postres y bebidas -- bloques con nombre,
 * no un scroll continuo -- y en un móvil el scroll continuo obliga a recorrer
 * los principales enteros para llegar a las bebidas. Con secciones, cada una
 * cabe en una pantalla y cambiar de una a otra es un gesto.
 *
 * El carril es un `scroll-snap` nativo en vez de un carrusel en JavaScript:
 * arrastrar con el dedo lo lleva el navegador, con su propia inercia y su
 * propio rebote, que ningún `transform` animado a mano iguala en un móvil. Las
 * flechas y las pestañas son el mismo carril movido con `scrollIntoView`, así
 * que las tres formas de navegar terminan en el mismo sitio.
 */
export function PublicMenuScreen({ restaurantId }: { restaurantId: string }) {
  const { t } = useI18n();

  const menuQuery = useQuery({
    queryKey: ["public-menu", restaurantId],
    retry: false,
    queryFn: () => menu.publicMenu(restaurantId),
  });

  if (menuQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (menuQuery.isError) {
    return <ErrorBox error={menuQuery.error} fallback={t("apiDown")} />;
  }

  const data = menuQuery.data as PublicMenu;
  const groups = groupBySection(data);
  const pdf = data.menuPdf;

  // La carta subida, si la hay. Se enlaza en vez de incrustarla: un visor de
  // PDF dentro de un iframe en un móvil es peor que el del propio teléfono, y
  // en varios navegadores no se ve en absoluto.
  const pdfLink = pdf ? (
    <a
      href={`${API_BASE_URL}${pdf.url}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3 transition-colors hover:border-primary"
    >
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm">{t("menuPdf")}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{t("menuPdfHint")}</span>
      </span>
    </a>
  ) : null;

  // Una carta que sólo es un PDF sigue teniendo algo que enseñar: el aviso de
  // "todavía no hay carta" sólo vale cuando tampoco hay archivo.
  if (groups.length === 0) {
    return pdfLink ?? <p className="text-sm text-muted-foreground">{t("menuEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {pdfLink}
      <SectionPager groups={groups} otherLabel={t("menuOther")} />
    </div>
  );
}

/**
 * El carril de secciones, con sus pestañas.
 *
 * La sección visible se deduce de dónde está el scroll, no de lo último que se
 * pulsó: así arrastrar con el dedo mueve la pestaña activa igual que pulsarla
 * mueve el carril, y las dos no pueden discrepar.
 */
function SectionPager({ groups, otherLabel }: { groups: Section[]; otherLabel: string }) {
  const { t } = useI18n();
  const rail = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (to: number) => {
    const clamped = Math.max(0, Math.min(groups.length - 1, to));
    const panel = rail.current?.children[clamped] as HTMLElement | undefined;
    // `scrollIntoView` en vez de fijar scrollLeft a mano: el navegador ya sabe
    // cuánto mide cada panel, incluso mientras el usuario está arrastrando.
    panel?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  // Qué panel se está mirando, leído del propio scroll. Sin `scrollend` porque
  // Safari no lo tiene: se calcula en cada scroll, que son dos divisiones, y
  // así no hay que esperar a que termine la inercia para mover la pestaña.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const onScroll = () => {
      const width = el.clientWidth || 1;
      const at = Math.max(0, Math.min(groups.length - 1, Math.round(el.scrollLeft / width)));
      setIndex((current) => (current === at ? current : at));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [groups.length]);

  // La pestaña activa se trae a la vista cuando cambia: con seis secciones no
  // caben todas, y la activa quedándose fuera de pantalla es justo lo que hace
  // que uno deje de saber dónde está.
  useEffect(() => {
    const tab = tabs.current?.children[index] as HTMLElement | undefined;
    tab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [index]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div
          ref={tabs}
          className="flex flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {groups.map((group, i) => (
            <button
              key={group.id ?? "__none__"}
              onClick={() => go(i)}
              aria-current={i === index}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors ${
                i === index
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:border-primary"
              }`}
            >
              {group.name ?? otherLabel}
            </button>
          ))}
        </div>

        {/* Sólo cuando sobra ancho: en un móvil el gesto es el arrastre, y dos
            botones ahí le quitan sitio a los nombres de las secciones. */}
        {groups.length > 1 && (
          <div className="hidden shrink-0 gap-1 sm:flex">
            <button
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label={t("menuSectionPrev")}
              className="rounded-full border border-border p-1.5 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => go(index + 1)}
              disabled={index === groups.length - 1}
              aria-label={t("menuSectionNext")}
              className="rounded-full border border-border p-1.5 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/*
        El carril. `snap-x snap-mandatory` con paneles al 100% es lo que hace
        que un arrastre corto salte una sección entera y se pare en su borde en
        vez de dejarla a medias, y lo lleva el navegador con la inercia del
        sistema. `overscroll-x-contain` evita que el gesto en la última sección
        se lo lleve el "atrás" del navegador.
      */}
      <div
        ref={rail}
        className="mt-3 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {groups.map((group) => (
          <section
            key={group.id ?? "__none__"}
            className="w-full shrink-0 snap-start pr-0.5"
            aria-label={group.name ?? otherLabel}
          >
            <ul className="space-y-2">
              {group.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Cuántas quedan. Con el carril a pantalla completa no asoma nada por el
          borde, así que sin esto no hay forma de saber que hay más. */}
      {groups.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {groups.map((group, i) => (
            <span
              key={group.id ?? "__none__"}
              className={`h-1 rounded-full transition-all ${
                i === index ? "w-4 bg-primary" : "w-1 bg-border"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Un plato.
 *
 * La foto es opcional y la fila se lee igual sin ella: la mayoría de las cartas
 * empiezan sin fotos y algunas se quedan así, de modo que la versión sin foto
 * tiene que verse deliberada y no rota. Por eso no hay hueco reservado ni
 * imagen de relleno cuando no hay foto.
 */
function ProductCard({ product }: { product: PublicProduct }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border/60 bg-secondary/30 p-2.5">
      {product.imageUrl && (
        <img
          // Tal cual viene del backend, con su sufijo `?v=`: ese sufijo cambia
          // cuando cambia la foto, y es lo que impide que el móvil siga
          // enseñando el plato de la temporada pasada.
          src={`${API_BASE_URL}${product.imageUrl}`}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-20 w-20 shrink-0 rounded-md object-cover"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">{product.name}</p>
          <span className="shrink-0 text-sm tabular-nums">
            {formatMoney(product.priceMinorUnits, product.currency)}
          </span>
        </div>
        {product.description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        )}
      </div>
    </li>
  );
}

type Section = { id: string | null; name: string | null; products: PublicProduct[] };

/**
 * Agrupa los productos por sección respetando el orden de `categories`.
 *
 * Se recorre la lista de secciones en vez de la de productos: así una sección
 * queda en su sitio aunque el backend devuelva sus productos en otro bloque, y
 * una sección vacía simplemente no se pinta en lugar de aparecer donde no toca.
 */
function groupBySection(data: PublicMenu): Section[] {
  const byCategory = new Map<string, PublicProduct[]>();
  const uncategorised: PublicProduct[] = [];
  for (const product of data.products ?? []) {
    if (!product.categoryId) {
      uncategorised.push(product);
      continue;
    }
    const bucket = byCategory.get(product.categoryId);
    if (bucket) bucket.push(product);
    else byCategory.set(product.categoryId, [product]);
  }

  const sections: Section[] = [];
  for (const category of data.categories ?? []) {
    const products = byCategory.get(category.id);
    if (products?.length) sections.push({ id: category.id, name: category.name, products });
  }
  if (uncategorised.length) sections.push({ id: null, name: null, products: uncategorised });
  return sections;
}
