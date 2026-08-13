import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  errorFields,
  errorFieldsText,
  formatMinor,
  menu,
  parseMinorInput,
  staffSession,
  type MenuCurrency,
  type Product,
} from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menú del restaurante — Mesa" },
      {
        name: "description",
        content: "Crea productos, fija precios en céntimos y elige la moneda del menú.",
      },
      { property: "og:title", content: "Menú del restaurante — Mesa" },
      { property: "og:description", content: "Productos, precios y moneda del menú." },
    ],
  }),
  component: MenuPage,
});

const CURRENCIES: MenuCurrency[] = ["VES", "USD", "EUR"];

type FieldErrors = Record<string, string>;

function fieldsOf(error: unknown): FieldErrors {
  return errorFields(error);
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

  const setCurrency = useMutation({
    mutationFn: (c: MenuCurrency) => menu.setCurrency(c),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu-settings"] }),
    onError: fail,
  });

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
          <LangToggle />
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
            <section className="surface mt-6 p-6">
              <h2 className="text-xl">{t("menuCurrency")}</h2>
              {settings.isError && <ErrorBox error={settings.error} fallback={t("apiDown")} />}
              <div className="mt-3 flex gap-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency.mutate(c)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                      settings.data?.menuCurrency === c
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </section>

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
                  <input
                    value={price}
                    inputMode="decimal"
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="1.250,50"
                    className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                  />
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
                <button
                  disabled={!name.trim() || !price.trim() || create.isPending}
                  onClick={() => create.mutate()}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" /> {t("addProduct")}
                </button>
              </div>
            </section>

            <section className="surface mt-6 p-6">
              <h2 className="text-xl">{t("items")}</h2>
              {products.isLoading && (
                <p className="mt-3 text-sm text-muted-foreground">{t("loading")}</p>
              )}
              {products.isError && <ErrorBox error={products.error} fallback={t("apiDown")} />}
              {products.isSuccess && products.data.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">{t("noProducts")}</p>
              )}
              <ul className="mt-4 space-y-3 text-sm">
                {(products.data ?? []).map((p) =>
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
                      className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3"
                    >
                      <div className={p.active ? "" : "text-muted-foreground line-through"}>
                        <p>
                          {p.name}
                          {!p.active && ` · ${t("inactive")}`}
                        </p>
                        {p.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                        )}
                      </div>
                      <span className="flex items-center gap-3">
                        <span>
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
        <input
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
        />
      </div>
      <input
        value={description}
        maxLength={500}
        placeholder={t("productDescription")}
        onChange={(e) => setDescription(e.target.value)}
        className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
      />
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
