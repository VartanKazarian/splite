import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import { ApiError, formatMinor, menu, staffSession, type MenuCurrency } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menú del restaurante — Mesa" },
      {
        name: "description",
        content: "Crea productos, fija precios en unidades menores y elige la moneda del menú.",
      },
      { property: "og:title", content: "Menú del restaurante — Mesa" },
      { property: "og:description", content: "Productos, precios y moneda del menú." },
    ],
  }),
  component: MenuPage,
});

const CURRENCIES: MenuCurrency[] = ["VES", "USD", "EUR"];

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

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown"));

  const create = useMutation({
    mutationFn: () =>
      menu.createProduct({ name: name.trim(), priceMinorUnits: price.replace(/\D/g, "") }),
    onSuccess: () => {
      setName("");
      setPrice("");
      toast.success(t("addProduct"));
      queryClient.invalidateQueries({ queryKey: ["menu-products"] });
    },
    onError: fail,
  });

  const toggle = useMutation({
    mutationFn: (p: { id: string; active: boolean }) =>
      menu.updateProduct(p.id, { active: p.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu-products"] }),
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => menu.deleteProduct(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu-products"] }),
    onError: fail,
  });

  const setCurrency = useMutation({
    mutationFn: (c: MenuCurrency) => menu.setCurrency(c),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu-settings"] }),
    onError: fail,
  });

  if (!ready) return null;

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
          <div className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_0.8fr_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("productName")}
              className="rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
            />
            <input
              value={price}
              inputMode="numeric"
              onChange={(e) => setPrice(e.target.value)}
              placeholder="756710"
              className="rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
            />
            <button
              disabled={!name.trim() || !price.replace(/\D/g, "") || create.isPending}
              onClick={() => create.mutate()}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> {t("addProduct")}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{t("priceHint")}</p>
        </section>

        <section className="surface mt-6 p-6">
          <h2 className="text-xl">{t("items")}</h2>
          {products.isLoading && <p className="mt-3 text-sm text-muted-foreground">{t("loading")}</p>}
          {products.isError && <ErrorBox error={products.error} fallback={t("apiDown")} />}
          {products.isSuccess && products.data.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">{t("noProducts")}</p>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {(products.data ?? []).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2"
              >
                <span className={p.active ? "" : "text-muted-foreground line-through"}>
                  {p.name}
                  {!p.active && ` · ${t("inactive")}`}
                </span>
                <span className="flex items-center gap-3">
                  <span>
                    {p.currency} {formatMinor(p.priceMinorUnits)}
                  </span>
                  <button
                    onClick={() => toggle.mutate({ id: p.id, active: !p.active })}
                    className="rounded-full border border-border px-3 py-1 text-xs"
                  >
                    {p.active ? t("deactivate") : t("activate")}
                  </button>
                  <button
                    onClick={() => remove.mutate(p.id)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-destructive"
                    aria-label={t("remove")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
