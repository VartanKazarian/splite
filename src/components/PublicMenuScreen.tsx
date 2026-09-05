import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { FileText, Search, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { API_BASE_URL, formatMoney, menu, type PublicMenu, type PublicProduct } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

/**
 * La carta, tal y como la lee un comensal sentado en la mesa.
 *
 * Sin sesión y sin login: el endpoint público sólo necesita el id del
 * restaurante, que la pantalla anterior ya resolvió a partir del QR.
 *
 * La forma es la de una carta de verdad: una lista que se recorre de arriba
 * abajo, con las secciones como títulos dentro de ella y un selector fijo
 * arriba para saltar. La versión anterior era un carrusel por secciones, y
 * pasar la carta entera obligaba a un gesto por sección sin poder ver nunca
 * dos a la vez; una lista se hojea, que es lo que se hace con una carta.
 *
 * Cada plato: el nombre, la descripción recortada a dos líneas, el precio, y
 * la foto a la derecha cuando la hay. Las filas sin foto se leen igual -- la
 * mayoría de las cartas empiezan sin ninguna.
 */
export function PublicMenuScreen({ restaurantId }: { restaurantId: string }) {
  const { t } = useI18n();

  const menuQuery = useQuery({
    queryKey: ["public-menu", restaurantId],
    retry: false,
    queryFn: () => menu.publicMenu(restaurantId),
  });

  if (menuQuery.isLoading) {
    return <p className="px-5 text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (menuQuery.isError) {
    return (
      <div className="px-5">
        <ErrorBox error={menuQuery.error} fallback={t("apiDown")} />
      </div>
    );
  }

  const data = menuQuery.data as PublicMenu;
  const groups = groupBySection(data);

  return <MenuList groups={groups} pdf={data.menuPdf} />;
}

type Section = { id: string | null; name: string | null; products: PublicProduct[] };
type Pdf = PublicMenu["menuPdf"];

function MenuList({ groups, pdf }: { groups: Section[]; pdf: Pdf }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  // Un ancla por sección, para saltar a ella y para saber cuál se está mirando.
  const anchors = useRef<(HTMLElement | null)[]>([]);
  // Hasta cuándo el salto tiene prioridad sobre la posición. Ver el efecto.
  const locked = useRef(0);
  // La tira de pestañas, para traer la marcada a la vista.
  const chips = useRef<HTMLDivElement>(null);

  // La carta subida, si la hay. Se enlaza en vez de incrustarla: un visor de
  // PDF dentro de un iframe en un móvil es peor que el del propio teléfono, y
  // en varios navegadores no se ve en absoluto.
  const pdfLink = pdf ? (
    <a
      href={`${API_BASE_URL}${pdf.url}`}
      target="_blank"
      rel="noreferrer"
      className="mx-5 flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:border-primary"
    >
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm">{t("menuPdf")}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{t("menuPdfHint")}</span>
      </span>
    </a>
  ) : null;

  const term = query.trim().toLowerCase();
  // Buscar recorta la carta en vez de saltar por ella: con veinte platos por
  // sección, "pollo" es más rápido que recordar en qué sección estaba.
  const shown = useMemo(() => {
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        products: group.products.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            (p.description ?? "").toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.products.length > 0);
  }, [groups, term]);

  /**
   * Qué sección se está mirando.
   *
   * Se decide por la que tiene su título más arriba sin haberse ido de la
   * pantalla, medido contra el alto de la cabecera fija: así el selector marca
   * la sección cuyos platos se están viendo, no la que ya pasó de largo.
   */
  useEffect(() => {
    if (term) return;
    const onScroll = () => {
      // Mientras dura el salto manda lo que se pulsó, no lo que se ve.
      //
      // Las últimas secciones de una carta corta no pueden llegar arriba del
      // todo: el scroll topa con el final del documento. Sin esto, pulsar
      // "Bebidas" dejaba la marca en "Postres" -- medido en el navegador -- y
      // parecía que el botón no había hecho nada.
      if (Date.now() < locked.current) return;
      const line = 140;
      let current = 0;
      anchors.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) current = i;
      });
      setActive((prev) => (prev === current ? prev : current));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [term, shown.length]);

  // La pestaña marcada se trae a la vista cuando cambia: con seis secciones no
  // caben todas en el ancho de un móvil, y la activa quedándose fuera de
  // pantalla es justo lo que hace que uno deje de saber en qué parte va.
  //
  // Moviendo la tira a mano y no con `scrollIntoView`: ese método recoloca
  // *todos* los contenedores con scroll por encima, incluida la página, y en el
  // navegador se llevaba la carta de vuelta arriba justo después de saltar a
  // una sección -- el salto parecía no funcionar. Aquí sólo se mueve la tira.
  useEffect(() => {
    const strip = chips.current;
    const chip = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !chip) return;
    const stripBox = strip.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const delta = chipBox.left - stripBox.left - (stripBox.width - chipBox.width) / 2;
    strip.scrollTo({ left: strip.scrollLeft + delta, behavior: "smooth" });
  }, [active]);

  const jump = (index: number) => {
    const el = anchors.current[index];
    if (!el) return;
    setActive(index);
    // Lo que dura un scroll suave. Pasado eso vuelve a mandar la posición, así
    // que en cuanto el comensal desliza con el dedo la marca se corrige sola.
    locked.current = Date.now() + 900;
    // `scroll-mt` en la propia sección deja sitio para la cabecera fija, así el
    // título no queda debajo de ella al saltar.
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (groups.length === 0) {
    return (
      <div className="px-5">
        {pdfLink ?? <p className="text-sm text-muted-foreground">{t("menuEmpty")}</p>}
      </div>
    );
  }

  return (
    <div className="pb-10">
      {/*
        Cabecera fija. Es lo que convierte una carta larga en algo que se puede
        recorrer: el nombre de la sección y la búsqueda siguen ahí después de
        veinte platos, que es justo cuando hacen falta.
      */}
      <div className="sticky top-0 z-10 -mx-px border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-5 py-3">
          {searching ? (
            <div className="flex flex-1 items-center gap-2 rounded-full border border-input bg-secondary px-4 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("menuSearchPlaceholder")}
                className="w-full bg-transparent text-sm outline-none"
              />
              <button
                onClick={() => {
                  setQuery("");
                  setSearching(false);
                }}
                aria-label={t("cancel")}
                className="shrink-0 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Las secciones, en una tira que se desplaza. La activa se marca
                  sola según lo que se esté viendo, y pulsarla salta ahí. */}
              <div
                ref={chips}
                className="flex flex-1 gap-1.5 overflow-x-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {shown.map((group, i) => (
                  <button
                    key={group.id ?? "__none__"}
                    onClick={() => jump(i)}
                    aria-current={i === active}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors ${
                      i === active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {group.name ?? t("menuOther")}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setSearching(true);
                  // El foco después del render, o el input todavía no existe.
                  window.setTimeout(() => searchInput.current?.focus(), 0);
                }}
                aria-label={t("menuSearch")}
                className="shrink-0 rounded-full border border-border p-2 text-muted-foreground"
              >
                <Search className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {pdfLink && <div className="pt-4">{pdfLink}</div>}

      {term && shown.length === 0 && (
        <p className="px-5 pt-6 text-sm text-muted-foreground">
          {t("menuSearchEmpty").replace("{term}", query.trim())}
        </p>
      )}

      {shown.map((group, i) => (
        <section
          key={group.id ?? "__none__"}
          ref={(el) => {
            anchors.current[i] = el;
          }}
          // Deja sitio a la cabecera fija cuando se salta a esta sección.
          className="scroll-mt-16 pt-7 first:pt-5"
        >
          <h2 className="px-5 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {group.name ?? t("menuOther")}
          </h2>
          <ul className="mt-2">
            {group.products.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </ul>
        </section>
      ))}
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
 *
 * La descripción se recorta a dos líneas. Sin recortar, un plato con una lista
 * larga de ingredientes ocupa media pantalla y esconde los cuatro siguientes.
 */
function ProductRow({ product }: { product: PublicProduct }) {
  return (
    <li className="border-b border-border/60 px-5 py-4 last:border-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{product.name}</p>
          {product.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}
          <p className="mt-2 text-[15px] tabular-nums">
            {formatMoney(product.priceMinorUnits, product.currency)}
          </p>
        </div>
        {product.imageUrl && (
          <img
            // Tal cual viene del backend, con su sufijo `?v=`: ese sufijo cambia
            // cuando cambia la foto, y es lo que impide que el móvil siga
            // enseñando el plato de la temporada pasada.
            src={`${API_BASE_URL}${product.imageUrl}`}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-[104px] w-[104px] shrink-0 rounded-xl object-cover"
          />
        )}
      </div>
    </li>
  );
}

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
