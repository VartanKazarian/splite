import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Pencil, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { MenuOcrImport } from "@/components/MenuOcrImport";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  errorFields,
  errorFieldsText,
  formatMinor,
  menu,
  parseMinorInput,
  staffSession,
  type Product,
} from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menú del restaurante — Splite" },
      {
        name: "description",
        content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Menú del restaurante — Splite" },
      { property: "og:description", content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia." },
    ],
  }),
  component: MenuPage,
});

type FieldErrors = Record<string, string>;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

/* ---------------------------------------------------------------- category store */

const CATEGORY_KEY = "splite.menu.categories";

function readCategories(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CATEGORY_KEY) ?? "{}"); } catch { return {}; }
}

function saveCategories(map: Record<string, string>) {
  try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(map)); } catch {}
}

function useCategories() {
  const [map, setMap] = useState<Record<string, string>>(readCategories);

  const setProductCategory = (productId: string, category: string) => {
    setMap((prev) => {
      const next = { ...prev };
      if (category.trim()) next[productId] = category.trim();
      else delete next[productId];
      saveCategories(next);
      return next;
    });
  };

  const removeProduct = (productId: string) => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[productId];
      saveCategories(next);
      return next;
    });
  };

  return { map, setProductCategory, removeProduct };
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
  const d = new Date(latest);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("es-VE");
}

const UNCATEGORIZED = "Sin categoría";

/* ---------------------------------------------------------------- page */

function MenuPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const { map: categoryMap, setProductCategory, removeProduct: removeCategoryEntry } = useCategories();

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

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["menu-products"] });

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
      }),
    onSuccess: (product) => {
      if (category.trim()) setProductCategory(product.id, category.trim());
      setName("");
      setPrice("");
      setDescription("");
      setCategory("");
      setCreateErrors({});
      setAdding(false);
      toast.success(t("addProduct"));
      refresh();
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
      refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => menu.deleteProduct(id),
    onSuccess: (_, id) => {
      removeCategoryEntry(id);
      toast.success(t("productDeleted"));
      refresh();
    },
    onError: fail,
  });

  const all = useMemo(() => products.data ?? [], [products.data]);
  const activeCount = all.filter((p) => p.active).length;
  const inactiveCount = all.length - activeCount;
  const updatedAt = useMemo(() => lastUpdated(all), [all]);

  // All unique categories from the current map
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    all.forEach((p) => {
      const c = categoryMap[p.id];
      if (c) cats.add(c);
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b, "es"));
  }, [all, categoryMap]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((p) =>
        status === "ALL" ? true : status === "ACTIVE" ? p.active : !p.active,
      )
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q)
          : true,
      )
      .filter((p) => {
        if (categoryFilter === "ALL") return true;
        const cat = categoryMap[p.id] ?? UNCATEGORIZED;
        return cat === categoryFilter;
      })
      .sort((a, b) => {
        const catA = categoryMap[a.id] ?? UNCATEGORIZED;
        const catB = categoryMap[b.id] ?? UNCATEGORIZED;
        if (catA !== catB) return catA.localeCompare(catB, "es");
        return Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es");
      });
  }, [all, query, status, categoryFilter, categoryMap]);

  // Group visible products by category
  const grouped = useMemo(() => {
    const groups: { category: string; items: Product[] }[] = [];
    const seen = new Map<string, Product[]>();
    for (const p of visible) {
      const cat = categoryMap[p.id] ?? UNCATEGORIZED;
      if (!seen.has(cat)) {
        seen.set(cat, []);
        groups.push({ category: cat, items: seen.get(cat)! });
      }
      seen.get(cat)!.push(p);
    }
    // Always put UNCATEGORIZED last
    const uncatIdx = groups.findIndex((g) => g.category === UNCATEGORIZED);
    if (uncatIdx > 0) {
      const [uncat] = groups.splice(uncatIdx, 1);
      groups.push(uncat);
    }
    return groups;
  }, [visible, categoryMap]);

  if (!ready) return null;

  const forbidden = [settings.error, products.error].some(
    (e) => e instanceof ApiError && (e.code === "FORBIDDEN_ROLE" || e.status === 403),
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> {t("backToDashboard")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-3xl">{t("menuTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("menuSub")}</p>

        {forbidden ? (
          <section className="surface mt-6 p-6">
            <p className="text-sm text-muted-foreground">{t("menuForbidden")}</p>
          </section>
        ) : (
          <>
            {/* Resumen operativo del menú */}
            <section className="surface mt-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {settings.data?.name ?? t("menuTitle")}
                  </p>
                  <p className="mt-1 font-display text-3xl tabular-nums">
                    {settings.data?.menuCurrency ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Moneda del menú</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-right">
                  <div>
                    <p className="font-display text-2xl tabular-nums">{activeCount}</p>
                    <p className="text-xs text-muted-foreground">Activos</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl tabular-nums">{inactiveCount}</p>
                    <p className="text-xs text-muted-foreground">Inactivos</p>
                  </div>
                </div>
              </div>

              {settings.isError && <ErrorBox error={settings.error} fallback={t("apiDown")} />}

              {updatedAt && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Última actualización: {updatedAt}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAdding((v) => !v)}
                  className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground sm:flex-none"
                >
                  <Plus className="h-4 w-4" /> {t("addProduct")}
                </button>
                <Link
                  to="/settings"
                  className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-4 py-2.5 text-sm transition-colors hover:bg-secondary sm:flex-none"
                >
                  Cambiar moneda del menú
                </Link>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Los cambios aplican a nuevos pedidos. Los precios de cuentas ya abiertas no se
                modifican.
              </p>
            </section>

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
                        className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm tabular-nums outline-none focus:border-ring"
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
                  <CategoryInput
                    value={category}
                    onChange={setCategory}
                    suggestions={allCategories}
                  />
                </div>
                {createErrors["description"] && (
                  <p className="mt-1 text-[11px] text-destructive">{createErrors["description"]}</p>
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

            <MenuOcrImport onImported={refresh} />

            <section className="surface mt-6 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                <h2 className="text-xl">{t("items")}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {visible.length} / {all.length}
                </span>
              </div>

              {/* Filters */}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar producto"
                    aria-label="Buscar producto"
                    className="w-full rounded-lg border border-input bg-secondary py-2 pl-9 pr-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="flex gap-2">
                  {(
                    [
                      ["ALL", "Todos"],
                      ["ACTIVE", "Activos"],
                      ["INACTIVE", "Inactivos"],
                    ] as [StatusFilter, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setStatus(value)}
                      className={`flex-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors sm:flex-none ${
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

              {/* Category filter pills */}
              {allCategories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 px-0.5">
                  <button
                    onClick={() => setCategoryFilter("ALL")}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                      categoryFilter === "ALL"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    Todas las categorías
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat === categoryFilter ? "ALL" : cat)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                        categoryFilter === cat
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {products.isLoading && (
                <p className="mt-3 px-2 text-sm text-muted-foreground">{t("loading")}</p>
              )}
              {products.isError && <ErrorBox error={products.error} fallback={t("apiDown")} />}
              {products.isSuccess && all.length === 0 && (
                <p className="mt-3 px-2 text-sm text-muted-foreground">{t("noProducts")}</p>
              )}
              {products.isSuccess && all.length > 0 && visible.length === 0 && (
                <p className="mt-3 px-2 text-sm text-muted-foreground">
                  Ningún producto coincide con la búsqueda.
                </p>
              )}

              {/* Grouped product list */}
              <div className="mt-3 text-sm">
                {grouped.map(({ category: cat, items }) => (
                  <div key={cat} className="mb-2">
                    <div className="flex items-center gap-2 px-2 py-1">
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {cat}
                      </span>
                      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <ul>
                      {items.map((p) =>
                        editing?.id === p.id ? (
                          <li key={p.id} className="rounded-lg border border-border bg-secondary/40 mb-0.5 px-3 py-2">
                            <EditRow
                              product={p}
                              currentCategory={categoryMap[p.id] ?? ""}
                              pending={update.isPending}
                              errors={fieldsOf(update.error)}
                              suggestions={allCategories}
                              onCancel={() => setEditing(null)}
                              onSave={(body, newCat) => {
                                setProductCategory(p.id, newCat);
                                update.mutate({ id: p.id, body });
                              }}
                            />
                          </li>
                        ) : (
                          <li
                            key={p.id}
                            className="grid items-center gap-x-3 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50 sm:grid-cols-[1fr_auto]"
                          >
                            <div className={`min-w-0 ${p.active ? "" : "text-muted-foreground"}`}>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium">{p.name}</span>
                                <span
                                  className={`rounded-full px-1.5 py-px text-[10px] leading-tight ${
                                    p.active
                                      ? "bg-primary/15 text-primary"
                                      : "bg-secondary text-muted-foreground"
                                  }`}
                                >
                                  {p.active ? "Disponible" : "No disponible"}
                                </span>
                              </div>
                              {p.description && (
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {p.description}
                                </p>
                              )}
                              <p className="mt-0.5 tabular-nums text-xs sm:hidden">
                                {p.currency} {formatMinor(p.priceMinorUnits)}
                              </p>
                            </div>
                            <span className="flex items-center gap-2 sm:justify-end">
                              <span className="hidden tabular-nums text-sm sm:inline">
                                {p.currency} {formatMinor(p.priceMinorUnits)}
                              </span>
                              <button
                                onClick={() => setEditing(p)}
                                aria-label={t("edit")}
                                className="rounded-full border border-border p-1 text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => update.mutate({ id: p.id, body: { active: !p.active } })}
                                className="rounded-full border border-border px-2.5 py-0.5 text-[11px] hover:bg-secondary"
                              >
                                {p.active ? t("deactivate") : t("activate")}
                              </button>
                              <button
                                onClick={() => remove.mutate(p.id)}
                                className="rounded-full border border-border p-1 text-destructive"
                                aria-label={t("remove")}
                              >
                                <Trash2 className="h-3 w-3" />
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
          </>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- CategoryInput */

function CategoryInput({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(value.toLowerCase()),
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-4 py-3 focus-within:border-ring">
        <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={value}
          maxLength={60}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Categoría (ej. Bebidas)"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {suggestions.length > 0 && (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={() => { onChange(s); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Tag className="h-3 w-3 text-muted-foreground" />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- EditRow */

function EditRow({
  product,
  currentCategory,
  pending,
  errors,
  suggestions,
  onCancel,
  onSave,
}: {
  product: Product;
  currentCategory: string;
  pending: boolean;
  errors: FieldErrors;
  suggestions: string[];
  onCancel: () => void;
  onSave: (
    body: {
      name?: string;
      priceMinorUnits?: string;
      description?: string | null;
      active?: boolean;
    },
    category: string,
  ) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(formatMinor(product.priceMinorUnits));
  const [description, setDescription] = useState(product.description ?? "");
  const [category, setCategory] = useState(currentCategory);

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
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-ring"
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
        <CategoryInput value={category} onChange={setCategory} suggestions={suggestions} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Los cambios aplican a nuevos pedidos. Los precios de cuentas ya abiertas no se modifican.
      </p>
      {Object.entries(errors).map(([field, message]) => (
        <p key={field} className="text-[11px] text-destructive">
          {field}: {message}
        </p>
      ))}
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            onSave(
              {
                name: name.trim(),
                priceMinorUnits: parseMinorInput(price),
                description: description.trim() ? description.trim() : null,
              },
              category,
            )
          }
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" /> {t("save")}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-xs"
        >
          <X className="h-3.5 w-3.5" /> {t("cancel")}
        </button>
      </div>
    </div>
  );
}
