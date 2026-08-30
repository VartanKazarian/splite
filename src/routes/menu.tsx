import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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

function MenuPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

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
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["menu-products"] });

  // Se ramifica por error.code, nunca por el mensaje.
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
      // Nunca se envía `currency`: la fija el restaurante.
      menu.createProduct({
        name: name.trim(),
        priceMinorUnits: parseMinorInput(price),
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      setName("");
      setPrice("");
      setDescription("");
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
    onSuccess: () => {
      toast.success(t("productDeleted"));
      refresh();
    },
    onError: fail,
  });

  const all = useMemo(() => products.data ?? [], [products.data]);
  const activeCount = all.filter((p) => p.active).length;
  const inactiveCount = all.length - activeCount;
  const updatedAt = useMemo(() => lastUpdated(all), [all]);

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
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"));
  }, [all, query, status]);

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
                <div className="mt-3">
                  <input
                    value={description}
                    maxLength={500}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("productDescription")}
                    className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                  />
                  {createErrors["description"] && (
                    <p className="mt-1 text-[11px] text-destructive">{createErrors["description"]}</p>
                  )}
                </div>
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

            <section className="surface mt-6 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl">{t("items")}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {visible.length} / {all.length}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar producto"
                    aria-label="Buscar producto"
                    className="w-full rounded-lg border border-input bg-secondary py-2.5 pl-9 pr-3 text-sm outline-none focus:border-ring"
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
                      className={`flex-1 whitespace-nowrap rounded-full border px-3 py-2 text-xs transition-colors sm:flex-none ${
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

              {products.isLoading && (
                <p className="mt-3 text-sm text-muted-foreground">{t("loading")}</p>
              )}
              {products.isError && <ErrorBox error={products.error} fallback={t("apiDown")} />}
              {products.isSuccess && all.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">{t("noProducts")}</p>
              )}
              {products.isSuccess && all.length > 0 && visible.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Ningún producto coincide con la búsqueda.
                </p>
              )}

              <ul className="mt-4 space-y-3 text-sm">
                {visible.map((p) =>
                  editing?.id === p.id ? (
                    <li key={p.id} className="border-b border-border pb-3">
                      <EditRow
                        product={p}
                        pending={update.isPending}
                        errors={fieldsOf(update.error)}
                        onCancel={() => setEditing(null)}
                        onSave={(body) => update.mutate({ id: p.id, body })}
                      />
                    </li>
                  ) : (
                    <li
                      key={p.id}
                      className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[1fr_auto] sm:items-start"
                    >
                      <div className={p.active ? "" : "text-muted-foreground"}>
                        <p className="flex flex-wrap items-center gap-2">
                          <span>{p.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              p.active
                                ? "bg-primary/15 text-primary"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {p.active ? "Disponible" : "No disponible"}
                          </span>
                        </p>
                        {p.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                        )}
                        <p className="mt-1 tabular-nums sm:hidden">
                          {p.currency} {formatMinor(p.priceMinorUnits)}
                        </p>
                      </div>
                      <span className="flex flex-wrap items-center gap-3 sm:justify-end">
                        <span className="hidden tabular-nums sm:inline">
                          {p.currency} {formatMinor(p.priceMinorUnits)}
                        </span>
                        <button
                          onClick={() => setEditing(p)}
                          aria-label={t("edit")}
                          className="rounded-full border border-border p-1.5"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => update.mutate({ id: p.id, body: { active: !p.active } })}
                          className="rounded-full border border-border px-3 py-1 text-xs"
                        >
                          {p.active ? t("deactivate") : t("activate")}
                        </button>
                        <button
                          onClick={() => remove.mutate(p.id)}
                          className="rounded-full border border-border p-1.5 text-destructive"
                          aria-label={t("remove")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function EditRow({
  product,
  pending,
  errors,
  onCancel,
  onSave,
}: {
  product: Product;
  pending: boolean;
  errors: FieldErrors;
  onCancel: () => void;
  onSave: (body: {
    name?: string;
    priceMinorUnits?: string;
    description?: string | null;
    active?: boolean;
  }) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(formatMinor(product.priceMinorUnits));
  const [description, setDescription] = useState(product.description ?? "");

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[1.2fr_0.6fr]">
        <input
          value={name}
          maxLength={160}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
        />
        <div className="flex items-center gap-2">
          <input
            value={price}
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-input bg-secondary px-3 py-2 text-sm tabular-nums outline-none focus:border-ring"
          />
          <span className="text-xs text-muted-foreground">{product.currency}</span>
        </div>
      </div>
      <input
        value={description}
        maxLength={500}
        placeholder={t("productDescription")}
        onChange={(e) => setDescription(e.target.value)}
        className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
      />
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
            onSave({
              name: name.trim(),
              priceMinorUnits: parseMinorInput(price),
              description: description.trim() ? description.trim() : null,
            })
          }
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" /> {t("save")}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs"
        >
          <X className="h-3.5 w-3.5" /> {t("cancel")}
        </button>
      </div>
    </div>
  );
}
