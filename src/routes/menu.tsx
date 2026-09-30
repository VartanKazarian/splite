import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ImageIcon,
  Plus,
  Search,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { MenuOcrImport } from "@/components/MenuOcrImport";
import { MenuSections } from "@/components/MenuSections";
import { MenuPdfCard } from "@/components/MenuPdfCard";
import { ProductSheet } from "@/components/panel/ProductSheet";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import {
  API_BASE_URL,
  ApiError,
  formatMoney,
  menu,
  staffSession,
  type MenuCategory,
  type Product,
} from "@/lib/api";
import { moveBy, sortLikeMenu, withSectionOrder } from "@/lib/menu-order";
import { ErrorBox } from "@/routes/dashboard";
import { PanelHeader } from "@/components/PanelHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatDateTime } from "../lib/dates";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menú del restaurante — Splite" },
      {
        name: "description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      { property: "og:title", content: "Menú del restaurante — Splite" },
      {
        property: "og:description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
    ],
  }),
  component: MenuPage,
});

/* ---------------------------------------------------------------- category store */

const CATEGORY_KEY = "splite.menu.categories";

/**
 * Las categorías que esta pantalla guardaba en el navegador.
 *
 * Eran un `productId -> nombre` en `localStorage`, así que vivían en un solo
 * equipo: ni el resto del personal las veía, ni llegaban a la carta pública, y
 * se perdían al limpiar los datos del navegador. Ahora las secciones son filas
 * del servidor.
 *
 * Esto se queda para no tirar el trabajo de nadie: se leen los nombres una vez
 * para ofrecer importarlos, y después se borra la clave.
 */
function legacyCategoryNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CATEGORY_KEY) ?? "{}") as Record<string, string>;
    const names = new Set<string>();
    for (const value of Object.values(raw)) {
      const name = String(value ?? "").trim();
      if (name) names.add(name.slice(0, 80));
    }
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  } catch {
    return [];
  }
}

function forgetLegacyCategories() {
  try {
    localStorage.removeItem(CATEGORY_KEY);
  } catch {
    /* nada que hacer */
  }
}

/* ---------------------------------------------------------------- helpers */

function lastUpdated(products: Product[]): string | null {
  const stamps = products
    .map((p) => p.updatedAt ?? p.createdAt)
    .filter((v): v is string => Boolean(v))
    .sort();
  const latest = stamps[stamps.length - 1];
  if (!latest) return null;
  return latest;
}

const UNCATEGORIZED = "Sin categoría";

/* ---------------------------------------------------------------- page */

type Group = { key: string; categoryId: string | null; category: string; items: Product[] };

function MenuPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  // Sólo se lee en el navegador: leerlo en el render del servidor pintaría algo
  // distinto al primer render del cliente.
  const [legacyNames, setLegacyNames] = useState<string[]>([]);
  useEffect(() => setLegacyNames(legacyCategoryNames()), []);

  useEffect(() => {
    const session = staffSession.get();
    if (!session) navigate({ to: "/login" });
    else {
      setRole(session.user.role);
      setReady(true);
    }
  }, [navigate]);

  // Los mismos roles que el servidor deja escribir en la carta. Al resto se le
  // enseña la carta sin interruptores ni flechas: un control que siempre
  // contesta «no tienes permiso» sólo enseña a no tocar nada.
  const canManage = role === "OWNER" || role === "MANAGER";

  const settings = useQuery({
    queryKey: ["menu-settings"],
    queryFn: () => menu.settings(),
    enabled: ready,
    retry: false,
  });

  const products = useQuery({
    queryKey: ["menu-products"],
    queryFn: () => menu.products(),
    enabled: ready,
    retry: false,
  });

  const categories = useQuery({
    queryKey: ["menu-categories"],
    queryFn: () => menu.categories(),
    enabled: ready,
    retry: false,
  });

  const [sheet, setSheet] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });
  const [query, setQuery] = useState("");
  const [onlyUnavailable, setOnlyUnavailable] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [ordering, setOrdering] = useState<string | null>(null);

  const categoryRows = useMemo<MenuCategory[]>(
    () => categories.data?.data ?? [],
    [categories.data],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["menu-products"] });
  const refreshAll = () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
  };

  const fail = (error: unknown) => {
    toast.error(error instanceof ApiError ? error.message : t("apiDown"));
  };

  /**
   * Disponible / no disponible, desde la lista.
   *
   * Es lo que más se toca de una carta: se acabó el pescado a las nueve. Antes
   * costaba abrir el plato, bajar hasta «Desactivar» y guardar. Ahora es el
   * interruptor de la fila, cambia al pulsar -- sin esperar al servidor -- y
   * el aviso trae «Deshacer» por si fue el plato de al lado.
   */
  const availability = useMutation({
    mutationFn: (p: { id: string; active: boolean }) =>
      menu.updateProduct(p.id, { active: p.active }),
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: ["menu-products"] });
      const previous = queryClient.getQueryData<Product[]>(["menu-products"]);
      queryClient.setQueryData<Product[]>(["menu-products"], (list) =>
        (list ?? []).map((p) => (p.id === id ? { ...p, active } : p)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["menu-products"], context.previous);
      fail(error);
    },
    onSettled: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["public-menu"] });
    },
  });

  const setAvailable = (p: Product, active: boolean) => {
    availability.mutate({ id: p.id, active });
    toast(t(active ? "availabilityOn" : "availabilityOff").replace("{name}", p.name), {
      action: {
        label: t("undo"),
        onClick: () => availability.mutate({ id: p.id, active: !active }),
      },
    });
  };

  /** Mover un plato dentro de su sección. Igual que la disponibilidad: al pulsar. */
  const reorder = useMutation({
    mutationFn: (p: { categoryId: string | null; ids: string[] }) =>
      menu.reorderProducts(p.categoryId, p.ids),
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: ["menu-products"] });
      const previous = queryClient.getQueryData<Product[]>(["menu-products"]);
      queryClient.setQueryData<Product[]>(["menu-products"], (list) =>
        withSectionOrder(list ?? [], ids),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["menu-products"], context.previous);
      toast.error(t("reorderFailed"));
    },
    onSettled: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["public-menu"] });
    },
  });

  const all = useMemo(() => products.data ?? [], [products.data]);
  const activeCount = all.filter((p) => p.active).length;
  const inactiveCount = all.length - activeCount;
  const withPhotos = useMemo(() => all.some((p) => p.imageUrl), [all]);
  const updatedAt = useMemo(() => lastUpdated(all), [all]);

  /**
   * El pliegue de "Montar la carta", abierto o cerrado según haga falta.
   *
   * Cerrado para una carta hecha; abierto, y por encima de la lista, con la
   * carta vacía -- donde importarla de una foto es lo único que hay que hacer.
   * Se siembra una vez: si siguiera a `all.length`, importar la carta lo
   * cerraría en mitad del gesto.
   */
  const [setupOpen, setSetupOpen] = useState(false);
  const setupSeeded = useRef(false);
  useEffect(() => {
    if (setupSeeded.current || !products.isSuccess) return;
    setupSeeded.current = true;
    setSetupOpen(all.length === 0);
  }, [products.isSuccess, all.length]);

  const sectionRank = useMemo(() => {
    const index = new Map<string, number>();
    categoryRows.forEach((c, i) => index.set(c.id, i));
    return index;
  }, [categoryRows]);

  const filtering = Boolean(query.trim()) || onlyUnavailable || categoryFilter !== "ALL";
  // Ordenar con la lista filtrada movería platos respecto a otros que no se
  // ven. Al filtrar se sale del modo ordenar.
  useEffect(() => {
    if (filtering) setOrdering(null);
  }, [filtering]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortLikeMenu(all, sectionRank)
      .filter((p) => (onlyUnavailable ? !p.active : true))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)
          : true,
      )
      .filter((p) => {
        if (categoryFilter === "ALL") return true;
        if (categoryFilter === "NONE") return !p.categoryId;
        return p.categoryId === categoryFilter;
      });
  }, [all, query, onlyUnavailable, categoryFilter, sectionRank]);

  const grouped = useMemo(() => {
    const groups: Group[] = [];
    const seen = new Map<string, Product[]>();
    for (const p of visible) {
      const key = p.categoryId ?? "__none__";
      let bucket = seen.get(key);
      if (!bucket) {
        bucket = [];
        seen.set(key, bucket);
        groups.push({
          key,
          categoryId: p.categoryId ?? null,
          category: p.categoryName ?? UNCATEGORIZED,
          items: bucket,
        });
      }
      bucket.push(p);
    }
    return groups;
  }, [visible]);

  if (!ready) return null;

  const forbidden = [settings.error, products.error].some(
    (e) => e instanceof ApiError && (e.code === "FORBIDDEN_ROLE" || e.status === 403),
  );

  const openAdd = () => setSheet({ open: true, product: null });
  const openEdit = (p: Product) => setSheet({ open: true, product: p });
  const move = (group: Group, index: number, delta: -1 | 1) => {
    const current = group.items.map((p) => p.id);
    const next = moveBy(current, index, delta);
    if (next === current) return;
    reorder.mutate({ categoryId: group.categoryId, ids: next });
  };

  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs transition-colors ${
      on
        ? "border-primary bg-primary/10 text-primary-ink"
        : "border-border text-muted-foreground hover:bg-secondary"
    }`;

  return (
    <div className="min-h-screen">
      <PanelHeader current="menu" />

      <main className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader
          title={t("menuTitle")}
          meta={
            products.isSuccess
              ? t("menuMeta")
                  .replace("{products}", String(all.length))
                  .replace("{sections}", String(categories.data?.data.length ?? 0))
              : t("menuSub")
          }
          actions={
            /* Comprobar la carta no debería costar imprimir un código, ir a una
               mesa y escanearlo con el móvil -- que es por lo que no la
               comprobaba nadie. */
            <Link
              to="/preview"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-secondary"
            >
              <Smartphone className="h-4 w-4" /> {t("previewFromMenu")}
            </Link>
          }
        />
        {/* Los cargos deciden el total de una cuenta, y se buscan aquí. Se
            quedan en Configuración con el resto del dinero, pero desde aquí se
            dice dónde están. */}
        <p className="mt-1 text-xs text-muted-foreground">
          {t("chargesInMenuHint")}{" "}
          <Link to="/settings" hash="cobros" className="underline">
            {t("chargesInMenuLink")}
          </Link>
          .
        </p>

        {forbidden ? (
          <section className="surface mt-6 p-6">
            <p className="text-sm text-muted-foreground">{t("menuForbidden")}</p>
          </section>
        ) : (
          <div className="flex flex-col">
            <section className="surface mt-6 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl">{t("items")}</h2>
                  <span className="money-sm text-muted-foreground">
                    {visible.length} / {all.length}
                  </span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={openAdd}
                    className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                  >
                    <Plus className="h-4 w-4" /> {t("addProduct")}
                  </button>
                )}
              </div>

              {/* Buscar y filtrar, sólo cuando hay algo que buscar.
                  Una fila de fichas en vez de dos: «Todos / Activos /
                  Inactivos» eran tres botones de 44 px para algo que con el
                  interruptor de cada plato casi no hace falta. Queda «No
                  disponibles», y sólo cuando hay alguno. */}
              {all.length > 0 && (
                <>
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("searchProduct")}
                      aria-label={t("searchProduct")}
                      type="search"
                      className="min-h-11 w-full rounded-lg border border-input bg-secondary pl-9 pr-3 text-sm outline-none focus:border-ring"
                    />
                  </div>

                  <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0.5 [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      aria-pressed={categoryFilter === "ALL"}
                      onClick={() => setCategoryFilter("ALL")}
                      className={chip(categoryFilter === "ALL")}
                    >
                      {t("filterAllSections")}
                    </button>
                    {categoryRows.map((cat) => (
                      <button
                        type="button"
                        key={cat.id}
                        aria-pressed={categoryFilter === cat.id}
                        onClick={() =>
                          setCategoryFilter(cat.id === categoryFilter ? "ALL" : cat.id)
                        }
                        className={chip(categoryFilter === cat.id)}
                      >
                        {cat.name}
                      </button>
                    ))}
                    {(categories.data?.uncategorisedCount ?? 0) > 0 && (
                      <button
                        type="button"
                        aria-pressed={categoryFilter === "NONE"}
                        onClick={() =>
                          setCategoryFilter(categoryFilter === "NONE" ? "ALL" : "NONE")
                        }
                        className={chip(categoryFilter === "NONE")}
                      >
                        {UNCATEGORIZED}
                      </button>
                    )}
                    {inactiveCount > 0 && (
                      <button
                        type="button"
                        aria-pressed={onlyUnavailable}
                        onClick={() => setOnlyUnavailable((v) => !v)}
                        className={`${chip(onlyUnavailable)} sm:ml-auto`}
                      >
                        {t("filterUnavailable")}
                        <span className="figure">{inactiveCount}</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {products.isLoading && (
                <p className="mt-3 px-2 text-sm text-muted-foreground">{t("loading")}</p>
              )}
              {products.isError && <ErrorBox error={products.error} fallback={t("apiDown")} />}
              {products.isSuccess && all.length === 0 && (
                <p className="mt-3 px-2 text-sm text-muted-foreground">{t("noProducts")}</p>
              )}
              {products.isSuccess && all.length > 0 && visible.length === 0 && (
                <p className="mt-6 px-2 text-center text-sm text-muted-foreground">
                  {t("noProductMatch")}
                </p>
              )}

              <div className="mt-3 text-sm">
                {grouped.map((group) => {
                  const isOrdering = ordering === group.key;
                  return (
                    <section key={group.key} className="mb-3" aria-label={group.category}>
                      {/* La cabecera se queda pegada arriba al bajar: en una
                          carta de cuarenta platos, saber en qué sección se está
                          es saber dónde va a caer uno nuevo. */}
                      <div className="sticky top-0 z-[1] -mx-2 flex min-h-11 items-center gap-2 bg-card/95 px-4 backdrop-blur">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          {group.category}
                        </h3>
                        <span className="text-xs figure text-muted-foreground">
                          {group.items.length}
                        </span>
                        {canManage && group.items.length > 1 && (
                          <button
                            type="button"
                            disabled={filtering && !isOrdering}
                            title={filtering ? t("reorderClearFilters") : undefined}
                            onClick={() => setOrdering(isOrdering ? null : group.key)}
                            className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs transition-colors disabled:opacity-40 ${
                              isOrdering
                                ? "bg-primary font-medium text-primary-foreground"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                          >
                            {isOrdering ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> {t("reorderDone")}
                              </>
                            ) : (
                              <>
                                <ArrowUpDown className="h-3.5 w-3.5" /> {t("reorder")}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {isOrdering && (
                        <p className="px-2 pb-1 text-xs text-muted-foreground">
                          {t("reorderHint")}
                        </p>
                      )}
                      <ul>
                        {group.items.map((p, index) => (
                          <ProductRow
                            key={p.id}
                            product={p}
                            withPhoto={withPhotos}
                            canManage={canManage}
                            ordering={isOrdering}
                            first={index === 0}
                            last={index === group.items.length - 1}
                            onEdit={() => openEdit(p)}
                            onToggle={(active) => setAvailable(p, active)}
                            onMove={(delta) => move(group, index, delta)}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </section>

            {/* Montar la carta -- la moneda, las secciones, importar de una
                foto, el PDF -- son cuatro tarjetas que se usan al empezar y
                casi nunca después, y ocupaban los primeros 1.800 px de la
                pantalla. Los productos, que es a lo que se entra, quedaban
                debajo de todas ellas. Ahora van detrás de un pliegue y la
                lista sale primero. */}
            <details
              open={setupOpen}
              onToggle={(event) => setSetupOpen(event.currentTarget.open)}
              className={`surface group mt-6 p-4 ${setupOpen && all.length === 0 ? "order-first" : ""}`}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm">
                <span>{t("menuSetup")}</span>
                <ChevronDown
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="[&>*:first-child]:mt-4">
                {/* Resumen operativo del menú */}
                <section className="surface mt-6 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {settings.data?.name ?? t("menuTitle")}
                      </p>
                      <p className="mt-1 text-xl">
                        {settings.data?.menuCurrency
                          ? t(`currency${settings.data.menuCurrency}` as never)
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("menuCurrency")}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-right">
                      <div>
                        <p className="figure text-xl">{activeCount}</p>
                        <p className="text-xs text-muted-foreground">{t("filterActive")}</p>
                      </div>
                      <div>
                        <p className="figure text-xl">{inactiveCount}</p>
                        <p className="text-xs text-muted-foreground">{t("filterInactive")}</p>
                      </div>
                    </div>
                  </div>

                  {settings.isError && <ErrorBox error={settings.error} fallback={t("apiDown")} />}

                  {updatedAt && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("lastUpdated")}: {formatDateTime(updatedAt, lang)}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to="/settings"
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary sm:flex-none"
                    >
                      {t("changeMenuCurrency")}
                    </Link>
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">{t("menuPriceScope")}</p>
                </section>

                <MenuOcrImport onImported={refreshAll} />

                <MenuSections
                  onChanged={refresh}
                  legacy={{
                    names: legacyNames,
                    onImported: () => {
                      forgetLegacyCategories();
                      setLegacyNames([]);
                    },
                  }}
                />

                <MenuPdfCard />
              </div>
            </details>
          </div>
        )}
      </main>

      <ProductSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        product={sheet.product}
        defaultCategoryId={
          categoryFilter !== "ALL" && categoryFilter !== "NONE" ? categoryFilter : ""
        }
        categories={categoryRows}
        currency={settings.data?.menuCurrency ?? ""}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- ProductRow */

/**
 * Un plato en la lista.
 *
 * Toda la fila abre el plato -- antes sólo un lápiz de 44 px al final --, y a
 * la derecha queda un único control: el interruptor de disponible. Borrar,
 * la foto, la sección y el IVA viven en la hoja, que es donde además se ve de
 * qué plato se trata. Al ordenar, el interruptor cede el sitio a las flechas.
 */
function ProductRow({
  product: p,
  withPhoto,
  canManage,
  ordering,
  first,
  last,
  onEdit,
  onToggle,
  onMove,
}: {
  product: Product;
  withPhoto: boolean;
  canManage: boolean;
  ordering: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const switchId = `available-${p.id}`;
  const body = (
    <>
      {withPhoto &&
        (p.imageUrl ? (
          <img
            src={`${API_BASE_URL}${p.imageUrl}`}
            alt=""
            loading="lazy"
            className={`h-11 w-11 shrink-0 rounded-lg object-cover ${p.active ? "" : "opacity-50 grayscale"}`}
          />
        ) : (
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground/60"
          >
            <ImageIcon className="h-4 w-4" />
          </span>
        ))}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={`text-sm font-medium ${p.active ? "" : "text-muted-foreground line-through decoration-muted-foreground/40"}`}
          >
            {p.name}
          </span>
          {!p.active && (
            <span className="rounded-full bg-secondary px-2 py-px text-[11px] leading-tight text-muted-foreground">
              {t("unavailable")}
            </span>
          )}
        </span>
        {p.description && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {p.description}
          </span>
        )}
      </span>
      <span className={`money-sm shrink-0 ${p.active ? "" : "text-muted-foreground"}`}>
        {formatMoney(p.priceMinorUnits, p.currency)}
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-1 rounded-lg transition-colors hover:bg-secondary/50">
      {canManage && !ordering ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`${t("edit")} ${p.name}`}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-2 py-2">{body}</div>
      )}
      {ordering ? (
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label={t("moveUp").replace("{name}", p.name)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-25"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={t("moveDown").replace("{name}", p.name)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-25"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </span>
      ) : (
        canManage && (
          // La etiqueta hace de zona táctil de 44 px alrededor del interruptor,
          // que por sí solo mide 20.
          <label htmlFor={switchId} className="flex h-11 shrink-0 cursor-pointer items-center px-2">
            <Switch
              id={switchId}
              checked={p.active}
              onCheckedChange={onToggle}
              aria-label={t("availabilityToggle").replace("{name}", p.name)}
            />
          </label>
        )
      )}
    </li>
  );
}
