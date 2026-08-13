import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  errorFieldsText,
  formatBps,
  menu,
  parseBpsInput,
  staffSession,
  type MenuCurrency,
} from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configuración del restaurante — Mesa" },
      {
        name: "description",
        content: "Moneda del menú, IVA y servicio en basis points para las cuentas nuevas.",
      },
      { property: "og:title", content: "Configuración del restaurante — Mesa" },
      { property: "og:description", content: "Moneda del menú, IVA y cargo por servicio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const CURRENCIES: MenuCurrency[] = ["VES", "USD", "EUR"];

/** El porcentaje se convierte a bps con aritmética de dígitos (ver parseBpsInput). */
function bpsFromInput(value: string): number | null {
  const bps = parseBpsInput(value);
  if (!Number.isFinite(bps) || bps < 0 || bps > 10000) return null;
  return bps;
}

function SettingsPage() {
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

  const [vat, setVat] = useState("");
  const [service, setService] = useState("");
  const [blocked, setBlocked] = useState<number | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setVat(formatBps(settings.data.vatBps ?? 0).replace("%", ""));
    setService(formatBps(settings.data.serviceChargeBps ?? 0).replace("%", ""));
  }, [settings.data]);

  const fail = (error: unknown) => {
    if (!(error instanceof ApiError)) {
      toast.error(t("apiDown"));
      return;
    }
    const fields = errorFieldsText(error);
    toast.error(fields ? `${error.code} · ${fields}` : `${error.code} · ${error.message}`);
  };

  const saveCharges = useMutation({
    mutationFn: () => {
      const vatBps = bpsFromInput(vat);
      const serviceChargeBps = bpsFromInput(service);
      if (vatBps === null || serviceChargeBps === null) throw new Error("range");
      return menu.setCharges({ vatBps, serviceChargeBps });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["menu-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      const open = data.openBillsUnaffected ?? 0;
      if (open > 0) toast.success(t("openBillsUnaffected").replace("{n}", String(open)));
      else toast.success(t("ratesSaved"));
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        fail(error);
        return;
      }
      toast.error(t("ratesRange"));
    },
  });

  const setCurrency = useMutation({
    mutationFn: (c: MenuCurrency) => menu.setCurrency(c),
    onSuccess: (data) => {
      setBlocked(null);
      queryClient.setQueryData(["menu-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["menu-products"] });
      toast.success(t("saved"));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "MENU_CURRENCY_MISMATCH") {
        const n = Number(
          (error.details as Record<string, unknown>)?.["activeProductsInOtherCurrency"] ?? 0,
        );
        setBlocked(Number.isFinite(n) ? n : 0);
        return;
      }
      fail(error);
    },
  });

  /** Limpia los productos que bloquean el cambio de moneda: desactivar o borrar. */
  const cleanup = useMutation({
    mutationFn: async (mode: "deactivate" | "delete") => {
      const products = await menu.products();
      const currency = settings.data?.menuCurrency;
      const offending = products.filter((p) => p.active && p.currency !== currency);
      for (const p of offending) {
        if (mode === "delete") await menu.deleteProduct(p.id, true);
        else await menu.updateProduct(p.id, { active: false });
      }
    },
    onSuccess: () => {
      setBlocked(null);
      queryClient.invalidateQueries({ queryKey: ["menu-products"] });
      toast.success(t("productsUpdated"));
    },
    onError: fail,
  });

  if (!ready) return null;

  const forbidden =
    settings.error instanceof ApiError &&
    (settings.error.code === "FORBIDDEN_ROLE" || settings.error.status === 403);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> {t("backToDashboard")}
          </Link>
          <LangToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-3xl">{t("settingsTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settingsSub")}</p>

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
                    disabled={setCurrency.isPending}
                    onClick={() => setCurrency.mutate(c)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-40 ${
                      settings.data?.menuCurrency === c
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {blocked !== null && (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <p>{t("currencyBlocked").replace("{n}", String(blocked))}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={cleanup.isPending}
                      onClick={() => cleanup.mutate("deactivate")}
                      className="rounded-full border border-border px-4 py-2 text-xs disabled:opacity-40"
                    >
                      {t("deactivateOthers")}
                    </button>
                    <button
                      disabled={cleanup.isPending}
                      onClick={() => {
                        if (window.confirm(t("permanentDeleteConfirm"))) cleanup.mutate("delete");
                      }}
                      className="rounded-full border border-destructive px-4 py-2 text-xs text-destructive disabled:opacity-40"
                    >
                      {t("deleteOthersPermanently")}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="surface mt-6 p-6">
              <h2 className="text-xl">{t("charges")}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-muted-foreground">{t("vatLabel")}</span>
                  <input
                    value={vat}
                    inputMode="decimal"
                    onChange={(e) => setVat(e.target.value)}
                    placeholder="16"
                    className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {formatBps(bpsFromInput(vat) ?? 0)} · {bpsFromInput(vat) ?? "—"} bps
                  </span>
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">{t("serviceLabel")}</span>
                  <input
                    value={service}
                    inputMode="decimal"
                    onChange={(e) => setService(e.target.value)}
                    placeholder="10"
                    className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {formatBps(bpsFromInput(service) ?? 0)} · {bpsFromInput(service) ?? "—"} bps
                  </span>
                </label>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">{t("ratesHint")}</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  disabled={
                    saveCharges.isPending ||
                    bpsFromInput(vat) === null ||
                    bpsFromInput(service) === null
                  }
                  onClick={() => saveCharges.mutate()}
                  className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  {t("saveRates")}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
