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

            <PayoutSection />
            <ProvidersSection />
          </>
        )}

      </main>
    </div>
  );
}

/**
 * Dónde cobra el restaurante. Los cuatro campos van juntos: un payee a medias
 * se ve configurado en pantalla y no puede recibir dinero.
 */
function PayoutSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });
  const banksQuery = useQuery({
    queryKey: ["account-banks"],
    queryFn: () => account.banks(),
    retry: false,
  });

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [holderId, setHolderId] = useState("");

  useEffect(() => {
    const p = accountQuery.data?.payout;
    if (!p) return;
    setBankCode(p.bankCode ?? "");
    setAccountNumber(p.accountNumber ?? "");
    setPhone(p.phone ?? "");
    setHolderId(p.holderId ?? "");
  }, [accountQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      account.setPayout({
        bankCode,
        accountNumber: accountNumber.replace(/\D/g, ""),
        phone: phone.replace(/\D/g, ""),
        holderId: holderId.trim().toUpperCase(),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["account"], data);
      toast.success("Datos de cobro guardados");
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = errorFieldsText(error);
        toast.error(fields ? `${error.code} · ${fields}` : `${error.code} · ${error.message}`);
      } else toast.error(t("apiDown"));
    },
  });

  const clear = useMutation({
    mutationFn: () => account.setPayout({}),
    onSuccess: (data) => {
      queryClient.setQueryData(["account"], data);
      setBankCode("");
      setAccountNumber("");
      setPhone("");
      setHolderId("");
      toast.success("Datos de cobro eliminados");
    },
  });

  const field =
    "mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring";

  const complete =
    /^[0-9]{4}$/.test(bankCode) &&
    /^[0-9]{20}$/.test(accountNumber.replace(/\D/g, "")) &&
    phone.replace(/\D/g, "").length >= 10 &&
    /^[VEJPG][0-9]{6,9}$/.test(holderId.trim().toUpperCase());

  return (
    <section className="surface mt-6 p-6">
      <h2 className="text-xl">Datos de cobro (Pago Móvil)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Es lo que ve el comensal para pagarte. Splite nunca retiene el dinero: va de su banco al
        tuyo.
      </p>
      {accountQuery.isError && <ErrorBox error={accountQuery.error} fallback={t("apiDown")} />}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted-foreground">Banco</span>
          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={field}>
            <option value="">—</option>
            {(banksQuery.data ?? []).map((b) => (
              <option key={b.code} value={b.code}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Número de cuenta (20 dígitos)</span>
          <input
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
            className={field}
          />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Teléfono afiliado</span>
          <input
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            className={field}
          />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">RIF o cédula del titular</span>
          <input
            value={holderId}
            onChange={(e) => setHolderId(e.target.value.toUpperCase().slice(0, 10))}
            placeholder="J123456789"
            className={field}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={!complete || save.isPending}
          onClick={() => save.mutate()}
          className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {t("save")}
        </button>
        {accountQuery.data?.payout && (
          <button
            disabled={clear.isPending}
            onClick={() => clear.mutate()}
            className="rounded-full border border-border px-5 py-3 text-sm disabled:opacity-40"
          >
            Eliminar
          </button>
        )}
      </div>
    </section>
  );
}

const MERCANTIL_FIELDS = ["merchantId", "clientId", "secretKey", "integratorId", "terminalId"] as const;

/**
 * Credenciales del banco para cobrar C2P dentro de la app. Sólo OWNER.
 * Nunca se devuelven: la pantalla sólo puede decir si están configuradas.
 */
function ProvidersSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const providersQuery = useQuery({
    queryKey: ["payment-providers"],
    queryFn: () => account.providers(),
    retry: false,
  });

  const mercantil = (providersQuery.data ?? []).find((p) => p.provider === "MERCANTIL") ?? null;

  const save = useMutation({
    mutationFn: () => account.setProvider("MERCANTIL", values),
    onSuccess: () => {
      setValues({});
      queryClient.invalidateQueries({ queryKey: ["payment-providers"] });
      toast.success("Credenciales guardadas. El banco tiene que validarlas antes de activarse.");
    },
    onError: (error) => {
      if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
      else toast.error(t("apiDown"));
    },
  });

  const remove = useMutation({
    mutationFn: () => account.deleteProvider("MERCANTIL"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-providers"] });
      toast.success("Credenciales eliminadas");
    },
  });

  const forbidden =
    providersQuery.error instanceof ApiError &&
    (providersQuery.error.code === "FORBIDDEN_ROLE" || providersQuery.error.status === 403);

  if (forbidden) return null;

  const filled = MERCANTIL_FIELDS.every((f) => (values[f] ?? "").trim().length > 0);
  const field =
    "mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring";

  return (
    <section className="surface mt-6 p-6">
      <h2 className="text-xl">Cobro C2P (Mercantil)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Permite que el comensal pague desde su banco sin salir de la app. Las credenciales se
        guardan cifradas y nunca se vuelven a mostrar.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          {mercantil?.configured ? "Credenciales guardadas" : "Sin credenciales"}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          {mercantil?.enabled ? "Rail activo" : "Rail inactivo"}
        </span>
        {mercantil?.configured && !mercantil.credentialsValidatedAt && (
          <span className="rounded-full border border-amber-500/50 px-2.5 py-1 text-muted-foreground">
            Sin validar con el banco
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {MERCANTIL_FIELDS.map((f) => (
          <label key={f} className="text-sm">
            <span className="text-muted-foreground">{f}</span>
            <input
              type="password"
              autoComplete="off"
              value={values[f] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [f]: e.target.value }))}
              className={field}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={!filled || save.isPending}
          onClick={() => save.mutate()}
          className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          Guardar credenciales
        </button>
        {mercantil?.configured && (
          <button
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="rounded-full border border-destructive px-5 py-3 text-sm text-destructive disabled:opacity-40"
          >
            Eliminar
          </button>
        )}
      </div>
    </section>
  );
}

