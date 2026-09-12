import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/ConfirmButton";
import { MenuOcrImport } from "@/components/MenuOcrImport";
import { MenuSections } from "@/components/MenuSections";
import { MenuPdfCard } from "@/components/MenuPdfCard";
import { ProductPhoto } from "@/components/ProductPhoto";
import { useI18n } from "@/lib/i18n";
import {
  API_BASE_URL,
  ApiError,
  errorFields,
  errorFieldsText,
  formatMinor,
  formatMoney,
  menu,
  parseMinorInput,
  staffSession,
  type MenuCategory,
  type Product,
} from "@/lib/api";
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

type FieldErrors = Record<string, string>;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

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

function fieldsOf(error: unknown): FieldErrors {
  return errorFields(error);
}

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

function MenuPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  // Sólo se lee en el navegador: leerlo en el render del servidor pintaría algo
  // distinto al primer render del cliente.
  const [legacyNames, setLegacyNames] = useState<string[]>([]);
  useEffect(() => setLegacyNames(legacyCategoryNames()), []);

  useEffect(() => {
    if (!staffSession.get()) navigate({ to: "/login" });
    else setReady(true);
  }, [navigate]);

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

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const categoryRows = useMemo<MenuCategory[]>(
    () => categories.data?.data ?? [],
    [categories.data],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["menu-products"] });
  // Al mover un producto cambia el recuento de las secciones.
  const refreshAll = () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
  };

  const fail = (error: unknown) => {
    if (!(error instanceof ApiError)) return toast.error(t("apiDown"));
    if (error.code === "PRODUCT_NAME_TAKEN") return toast.error(t("nameTaken"));
    if (error.code === "PRODUCT_NOT_FOUND") {
      refresh();
      return toast.error(`${error.code} · ${error.message}`);
    }
    const fields = errorFieldsText(error);
    if (error.code === "VALIDATION_FAILED")
      return toast.error(fields ? `${error.message} — ${fields}` : error.message);
    if (fields) return toast.error(`${error.code} · ${fields}`);
    return toast.error(`${error.code} · ${error.message}`);
  };

  const create = useMutation({
    mutationFn: () =>
      menu.createProduct({
        name: name.trim(),
        priceMinorUnits: parseMinorInput(price),
        ...(description.trim() ? { description: description.trim() } : {}),
        // La sección va en la misma petición: antes se guardaba aparte en el
        // navegador y el producto llegaba al servidor sin ella.
        ...(categoryId ? { categoryId } : {}),
      }),
    onSuccess: () => {
      setName("");
      setPrice("");
      setDescription("");
      setCategoryId("");
      setCreateErrors({});
      setAdding(false);
      toast.success(t("addProduct"));
      refreshAll();
    },
    onError: (error) => {
      setCreateErrors(fieldsOf(error));
      fail(error);
    },
  });

  const update = useMutation({
    mutationFn: (p: { id: string; body: Parameters<typeof menu.updateProduct>[1] }) =>
      menu.updateProduct(p.id, p.body),
    onSuccess: () => {
      setEditing(null);
      toast.success(t("saved"));
      refreshAll();
    },
    onError: fail,
  });

  const remove = useMutation({
    // Permanente. Desactivar ya tiene su propio botón al lado; una papelera que
    // hace lo mismo que él deja platos muertos en la lista para siempre.
    mutationFn: (id: string) => menu.deleteProduct(id, true),
    onSuccess: () => {
      toast.success(t("productDeleted"));
      refreshAll();
    },
    onError: fail,
  });

  const all = useMemo(() => products.data ?? [], [products.data]);
  const activeCount = all.filter((p) => p.active).length;

  /**
   * ¿Hay alguna foto en esta carta?
   *
   * El hueco de la foto se reservaba siempre, incluida la carta que no tiene
   * ninguna -- que es como empiezan todas y como se quedan muchas: diez marcos
   * de trazo discontinuo con un icono gris, uno por plato, diciendo que falta
   * algo que nadie ha pedido. La regla es la misma que en la hoja de productos
   * del mesero: la columna existe si la carta usa fotos. Con una sola foto
   * vuelve, y entonces sí importa que los nombres empiecen todos en el mismo
   * sitio.
   */
  const withPhotos = useMemo(() => all.some((p) => p.imageUrl), [all]);

  /**
   * El pliegue de "Montar la carta", abierto o cerrado según haga falta.
   *
   * Cerrado es lo correcto para una carta hecha: la moneda, las secciones y la
   * importación se tocan al empezar y casi nunca después. Pero con la carta
   * vacía eso deja lo único que hay que hacer -- importarla de una foto o de un
   * PDF, que es la vía rápida -- plegada al final de la pantalla, debajo de una
   * lista que dice "Aún no hay productos". Así que con cero productos se abre,
   * y además sube por encima de la lista.
   *
   * Se siembra una vez, cuando llega la primera respuesta, y desde ahí manda
   * quien mira: si se controlara con `all.length` a secas, importar la carta lo
   * cerraría de golpe en mitad del gesto, y cerrarlo a mano no serviría de nada
   * porque el siguiente render volvería a abrirlo.
   */
  const [setupOpen, setSetupOpen] = useState(false);
  const setupSeeded = useRef(false);
  useEffect(() => {
    if (setupSeeded.current || !products.isSuccess) return;
    setupSeeded.current = true;
    setSetupOpen(all.length === 0);
  }, [products.isSuccess, all.length]);
  const inactiveCount = all.length - activeCount;
  const updatedAt = useMemo(() => lastUpdated(all), [all]);

  /**
   * El orden del menú, del servidor.
   *
   * Alfabético sería Bebidas, Entradas, Postres, Principales -- que no es una
   * carta. `position` es justamente lo que arregla eso, así que el orden sale
   * de la lista de secciones y no de los nombres.
   */
  const orderOf = useMemo(() => {
    const index = new Map<string, number>();
    categoryRows.forEach((c, i) => index.set(c.id, i));
    return index;
  }, [categoryRows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Sin sección va al final, nunca intercalado.
    const rank = (p: Product) =>
      p.categoryId
        ? (orderOf.get(p.categoryId) ?? Number.MAX_SAFE_INTEGER - 1)
        : Number.MAX_SAFE_INTEGER;
    return all
      .filter((p) => (status === "ALL" ? true : status === "ACTIVE" ? p.active : !p.active))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)
          : true,
      )
      .filter((p) => {
        if (categoryFilter === "ALL") return true;
        if (categoryFilter === "NONE") return !p.categoryId;
        return p.categoryId === categoryFilter;
      })
      .sort((a, b) => {
        const byCategory = rank(a) - rank(b);
        if (byCategory !== 0) return byCategory;
        return Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es");
      });
  }, [all, query, status, categoryFilter, orderOf]);

  const grouped = useMemo(() => {
    const groups: { key: string; category: string; items: Product[] }[] = [];
    const seen = new Map<string, Product[]>();
    for (const p of visible) {
      const key = p.categoryId ?? "__none__";
      const label = p.categoryName ?? UNCATEGORIZED;
      let bucket = seen.get(key);
      if (!bucket) {
        bucket = [];
        seen.set(key, bucket);
        groups.push({ key, category: label, items: bucket });
      }
      bucket.push(p);
    }
    return groups;
  }, [visible]);

  if (!ready) return null;

  const forbidden = [settings.error, products.error].some(
    (e) => e instanceof ApiError && (e.code === "FORBIDDEN_ROLE" || e.status === 403),
  );

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
            quedan en Configuración con el resto del dinero -- IVA, servicio y
            datos de cobro juntos -- pero desde aquí se dice dónde están. */}
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
              {/* Añadir un producto es lo que se viene a hacer aquí, así que
                  va junto a la lista y no dentro del pliegue de montaje. */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl">{t("items")}</h2>
                  <span className="money-sm text-muted-foreground">
                    {visible.length} / {all.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAdding((v) => !v)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> {adding ? t("cancel") : t("addProduct")}
                </button>
              </div>

              {adding && (
                <section className="surface mt-6 p-6">
                  <h2 className="text-xl">{t("addProduct")}</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                    <div>
                      <input
                        value={name}
                        maxLength={160}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("productName")}
                        className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                      />
                      {createErrors["name"] && (
                        <p className="mt-1 text-[11px] text-destructive">{createErrors["name"]}</p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          value={price}
                          inputMode="decimal"
                          onChange={(e) => setPrice(e.target.value)}
                          placeholder="1.250,50"
                          className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm figure outline-none focus:border-ring"
                        />
                        <span className="text-xs text-muted-foreground">
                          {settings.data?.menuCurrency ?? ""}
                        </span>
                      </div>
                      {createErrors["priceMinorUnits"] && (
                        <p className="mt-1 text-[11px] text-destructive">
                          {createErrors["priceMinorUnits"]}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      value={description}
                      maxLength={500}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("productDescription")}
                      className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                    />
                    <CategorySelect
                      value={categoryId}
                      onChange={setCategoryId}
                      categories={categoryRows}
                    />
                  </div>
                  {createErrors["description"] && (
                    <p className="mt-1 text-[11px] text-destructive">
                      {createErrors["description"]}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">{t("priceInputHint")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setAdding(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        disabled={!name.trim() || !price.trim() || create.isPending}
                        onClick={() => create.mutate()}
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" /> {t("addProduct")}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* Buscar y filtrar, sólo cuando hay algo que buscar. Con la
                  carta vacía eran un campo y ocho fichas encima de un "Aún no
                  hay productos": tres gestos ofrecidos sobre una lista que no
                  existe, y justo en la pantalla donde hay una sola cosa que
                  hacer. */}
              {all.length > 0 && (
                <>
                  {/* Filters */}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("searchProduct")}
                        aria-label={t("searchProduct")}
                        className="min-h-11 w-full rounded-lg border border-input bg-secondary pl-9 pr-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <div className="flex gap-2">
                      {(
                        [
                          ["ALL", t("filterAll")],
                          ["ACTIVE", t("filterActive")],
                          ["INACTIVE", t("filterInactive")],
                        ] as [StatusFilter, string][]
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          aria-pressed={status === value}
                          /*
                           * Volver a pulsar la ficha puesta quita el filtro.
                           *
                           * No se podía: pulsar "Inactivos" con "Inactivos"
                           * puesto no hacía nada, y para volver a verlo todo
                           * había que acertar con "Todos" -- que es otra ficha
                           * y no dice "quitar". Las fichas de sección de
                           * debajo sí se apagaban al segundo toque, así que la
                           * misma fila de arriba enseñaba a hacer algo que no
                           * funcionaba. "Todos" ya es no filtrar, así que
                           * apagarla es quedarse donde está.
                           */
                          onClick={() =>
                            setStatus(value === status && value !== "ALL" ? "ALL" : value)
                          }
                          className={`min-h-11 flex-1 whitespace-nowrap rounded-full border px-4 text-xs transition-colors sm:flex-none ${
                            status === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filtro por sección, en el orden de la carta */}
                  {(categoryRows.length > 0 || (categories.data?.uncategorisedCount ?? 0) > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 px-0.5">
                      <button
                        onClick={() => setCategoryFilter("ALL")}
                        className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[11px] transition-colors ${
                          categoryFilter === "ALL"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {t("filterAllSections")}
                      </button>
                      {categoryRows.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() =>
                            setCategoryFilter(cat.id === categoryFilter ? "ALL" : cat.id)
                          }
                          className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[11px] transition-colors ${
                            categoryFilter === cat.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {cat.name}
                        </button>
                      ))}
                      {(categories.data?.uncategorisedCount ?? 0) > 0 && (
                        <button
                          onClick={() =>
                            setCategoryFilter(categoryFilter === "NONE" ? "ALL" : "NONE")
                          }
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                            categoryFilter === "NONE"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {UNCATEGORIZED}
                        </button>
                      )}
                    </div>
                  )}
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
                <p className="mt-3 px-2 text-sm text-muted-foreground">{t("noProductMatch")}</p>
              )}

              {/* Grouped product list */}
              <div className="mt-3 text-sm">
                {grouped.map(({ category: cat, items }) => (
                  <div key={cat} className="mb-2">
                    <div className="flex items-center gap-2 px-2 py-1">
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {cat}
                      </span>
                      <span className="ml-auto text-[11px] figure text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <ul>
                      {items.map((p) =>
                        editing?.id === p.id ? (
                          <li
                            key={p.id}
                            className="rounded-lg border border-border bg-secondary/40 mb-0.5 px-3 py-2"
                          >
                            <EditRow
                              product={p}
                              categories={categoryRows}
                              pending={update.isPending}
                              errors={fieldsOf(update.error)}
                              onCancel={() => setEditing(null)}
                              onSave={(body) => update.mutate({ id: p.id, body })}
                              onToggleActive={() =>
                                update.mutate({ id: p.id, body: { active: !p.active } })
                              }
                              onDelete={() => remove.mutate(p.id)}
                            />
                          </li>
                        ) : (
                          <li
                            key={p.id}
                            /* Dos columnas también en el teléfono. Con tres
                               botones, la fila de acciones caía a su propia
                               línea porque no cabían; con uno solo, ese salto
                               dejaba un lápiz suelto debajo del precio y le
                               costaba 44 px a cada plato. */
                            className="grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"
                          >
                            <div
                              className={`flex min-w-0 items-center gap-2.5 ${p.active ? "" : "text-muted-foreground"}`}
                            >
                              {/* El hueco se reserva para que los nombres
                                  empiecen todos en el mismo sitio en una carta
                                  a medio fotografiar -- pero sólo si la carta
                                  tiene alguna foto. Ver `withPhotos`. */}
                              {withPhotos &&
                                (p.imageUrl ? (
                                  <img
                                    src={`${API_BASE_URL}${p.imageUrl}`}
                                    alt=""
                                    loading="lazy"
                                    className="h-9 w-9 shrink-0 rounded-md object-cover"
                                  />
                                ) : (
                                  <span
                                    aria-hidden
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/50"
                                  >
                                    <ImageIcon className="h-4 w-4" />
                                  </span>
                                ))}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-medium">{p.name}</span>
                                  {/* Sólo lo que se sale de lo normal. Un
                                      "Disponible" verde en los diez platos de
                                      una carta entera no distingue nada: lo que
                                      hay que ver de un vistazo es el que hoy no
                                      se sirve. Los inactivos ya van además en
                                      gris. */}
                                  {!p.active && (
                                    <span className="rounded-full bg-secondary px-1.5 py-px text-[11px] leading-tight text-muted-foreground">
                                      {t("unavailable")}
                                    </span>
                                  )}
                                </div>
                                {p.description && (
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {p.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            {/* Un solo control por fila.
                                Eran tres -- editar, desactivar y una papelera
                                roja que borra de verdad --, los tres a 44 px y
                                los tres siempre a la vista: treinta botones en
                                una carta de diez platos, con el que destruye
                                pesando lo mismo que el que corrige una errata.
                                Lo que se viene a hacer aquí es cambiar un
                                precio, así que eso se queda a un toque y las
                                otras dos bajan al formulario de edición, que es
                                donde además se ve qué plato se está tocando. */}
                            <span className="flex items-center justify-end gap-3">
                              <span className="money-sm">
                                {formatMoney(p.priceMinorUnits, p.currency)}
                              </span>
                              <button
                                onClick={() => setEditing(p)}
                                aria-label={`${t("edit")} ${p.name}`}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ))}
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
    </div>
  );
}

/* ---------------------------------------------------------------- EditRow */

/**
 * La sección de un producto, elegida de las que existen.
 *
 * Antes era texto libre con sugerencias, que sobre un almacén local daba igual;
 * contra el servidor no: los nombres son únicos por restaurante, así que
 * escribir "bebidas" donde ya hay "Bebidas" no crea una segunda sección, la
 * rechaza. Y una sección tiene un orden, que un nombre suelto no puede llevar.
 *
 * Así que se elige, y para crear una nueva está el gestor de secciones. El
 * valor vacío es "sin sección", que es una respuesta legítima y no un hueco:
 * hay cartas que son una sola lista.
 */
function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: MenuCategory[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-4 py-3 focus-within:border-ring">
      <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("sectionLabel")}
        className="w-full bg-transparent text-sm outline-none"
      >
        <option value="">{t("uncategorised")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.active ? "" : ` (${t("sectionHiddenSuffix")})`}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------------------------------------------------------- EditRow */

function EditRow({
  product,
  categories,
  pending,
  errors,
  onCancel,
  onSave,
  onToggleActive,
  onDelete,
}: {
  product: Product;
  categories: MenuCategory[];
  pending: boolean;
  errors: FieldErrors;
  onCancel: () => void;
  onSave: (body: {
    name?: string;
    priceMinorUnits?: string;
    description?: string | null;
    active?: boolean;
    categoryId?: string | null;
  }) => void;
  /** Quitarlo de la carta sin borrarlo, o devolverlo. */
  onToggleActive: () => void;
  /** Borrarlo de verdad. Detrás de una confirmación, siempre. */
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(formatMinor(product.priceMinorUnits));
  const [description, setDescription] = useState(product.description ?? "");
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[1.2fr_0.6fr]">
        <input
          value={name}
          maxLength={160}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
        />
        <div className="flex items-center gap-2">
          <input
            value={price}
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm figure outline-none focus:border-ring"
          />
          <span className="text-xs text-muted-foreground">{product.currency}</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={description}
          maxLength={500}
          placeholder={t("productDescription")}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring"
        />
        <CategorySelect value={categoryId} onChange={setCategoryId} categories={categories} />
      </div>
      {/* La foto se guarda al elegirla, no con el botón de abajo: es una subida
          aparte y esperar a "Guardar" para mandarla haría que el botón
          significase dos cosas distintas. */}
      <ProductPhoto product={product} />
      <p className="text-[11px] text-muted-foreground">
        Los cambios aplican a nuevos pedidos. Los precios de cuentas ya abiertas no se modifican.
      </p>
      {Object.entries(errors).map(([field, message]) => (
        <p key={field} className="text-[11px] text-destructive">
          {field}: {message}
        </p>
      ))}
      {/* Guardar y cancelar a la izquierda; a la derecha, y separadas, las dos
          que cambian lo que ve un comensal. Aquí y no en la fila de la lista:
          allí eran treinta botones siempre a la vista, y el que borra estaba a
          un toque de distancia del que corrige una errata. Todas a 44 px --
          medían 27 -- porque esto se usa de pie y con una mano. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          disabled={pending}
          onClick={() =>
            onSave({
              name: name.trim(),
              priceMinorUnits: parseMinorInput(price),
              description: description.trim() ? description.trim() : null,
              // Explícitamente null al vaciarlo: sacar un producto de su sección
              // es algo que se hace a propósito, y no es lo mismo que omitirlo.
              categoryId: categoryId || null,
            })
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> {t("save")}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm"
        >
          <X className="h-4 w-4" /> {t("cancel")}
        </button>

        <span className="ml-auto flex items-center gap-2">
          <button
            disabled={pending}
            onClick={onToggleActive}
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
          >
            {product.active ? t("deactivate") : t("activate")}
          </button>
          {/* Borra de verdad: el backend lo hace con `?permanent=true`. Es lo
              único de esta pantalla que no se puede deshacer, así que va detrás
              de una confirmación que dice el nombre del plato. */}
          <ConfirmButton
            title={t("confirmDeleteProduct")}
            description={t("confirmDeleteProductBody")}
            confirmLabel={t("confirmDeleteProductCta")}
            onConfirm={onDelete}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-destructive transition-colors hover:bg-destructive/10"
            aria-label={`${t("remove")} ${product.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </ConfirmButton>
        </span>
      </div>
    </div>
  );
}
