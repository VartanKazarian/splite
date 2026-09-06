import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  account,
  errorFieldsText,
  formatBps,
  menu,
  parseBpsInput,
  staffSession,
  type BankRef,
  type MenuCurrency,
  type PaymentProviderConfig,
  type StaffRole,
} from "@/lib/api";

import { ErrorBox } from "@/routes/dashboard";
import { StaffManager } from "@/components/StaffManager";
import { ChangePassword } from "@/components/ChangePassword";
import { DisplayNameField } from "@/components/DisplayNameField";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MfaPanel } from "@/components/MfaPanel";
import { RestaurantName } from "@/components/RestaurantName";
import { RestaurantBranding } from "@/components/RestaurantBranding";
import { PanelHeader } from "@/components/PanelHeader";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configuración del restaurante — Splite" },
      {
        name: "description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Configuración del restaurante — Splite" },
      {
        property: "og:description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
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

/**
 * Un grupo de la pantalla.
 *
 * La pantalla estaba ordenada por cuándo se construyó cada cosa: la contraseña
 * y el segundo factor -- que son de la persona, no del negocio -- salían
 * arriba del todo, y los datos de cobro, que deciden si el dinero llega,
 * quedaban al final de un scroll largo. Ahora hay cuatro grupos y el orden es
 * el de siempre: lo que ve un cliente, el dinero, el equipo, y tu propia
 * cuenta al final.
 */
/**
 * El plan, siempre visible.
 *
 * El banner sólo aparece cuando queda poco; esto está siempre, para que
 * «¿en qué plan estoy y hasta cuándo?» tenga una respuesta que no dependa de
 * que salte un aviso. Va en Cobros porque es dinero, aunque sea el único
 * dinero de esta pantalla que va en la otra dirección: lo que el restaurante
 * le paga a Splite, no lo que le pagan a él.
 */
function PlanSection() {
  const { t, lang } = useI18n();
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });

  const plan = accountQuery.data?.plan;
  const fmt = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "es-VE", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;

  const endsOn = fmt(plan?.trialEndsAt);
  const ended = (plan?.trialDaysRemaining ?? 1) <= 0;
  const since = fmt(accountQuery.data?.createdAt);

  return (
    <section className="surface mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">{t("planTitle")}</h2>
        {plan && (
          <span className="rounded-full border border-border px-3 py-1 text-xs">
            {t(`planTier${plan.tier}` as never)}
          </span>
        )}
      </div>

      {plan?.tier === "TRIAL" && endsOn && (
        <p className="mt-3 text-sm">
          {(ended ? t("planTrialEndedOn") : t("planTrialEndsOn")).replace("{date}", endsOn)}
        </p>
      )}

      {/* Lo que de verdad quiere saber quien mira esto. Nada en el backend
          corta el servicio al terminar la prueba, así que decirlo aquí evita
          que alguien deje de usar Splite por miedo a quedarse a medias en
          plena cena.

          Sólo en prueba: a quien ya paga, una frase sobre lo que pasa cuando
          la prueba termina no le dice nada y le hace preguntarse si le afecta. */}
      {plan?.tier === "TRIAL" && (
        <p className="mt-2 text-sm text-muted-foreground">{t("planNoCutoff")}</p>
      )}

      {since && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("planSince").replace("{date}", since)}
        </p>
      )}
    </section>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 pt-8 first:pt-4">
      <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<StaffRole | null>(null);
  // El id propio, para no ofrecer botones que el servidor va a rechazar:
  // nadie se cambia el rol ni se da de baja a sí mismo.
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    const s = staffSession.get();
    if (!s) navigate({ to: "/login" });
    else {
      setRole(s.user.role);
      setMeId(s.user.id);
      setReady(true);
    }
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

  const canManageMenu = role === "OWNER" || role === "MANAGER";
  const forbidden =
    !canManageMenu ||
    (settings.error instanceof ApiError &&
      (settings.error.code === "FORBIDDEN_ROLE" || settings.error.status === 403));
  const loading = settings.isLoading;

  // Los grupos que existen para quien está mirando. Mientras carga tampoco hay
  // a dónde saltar todavía.
  const jumps: Array<[string, string]> =
    forbidden || loading
      ? [["cuenta", t("settingsGroupAccount")]]
      : [
          ["restaurante", t("settingsGroupRestaurant")],
          ["cobros", t("settingsGroupMoney")],
          ["equipo", t("settingsGroupTeam")],
          ["cuenta", t("settingsGroupAccount")],
        ];

  return (
    <div className="min-h-screen">
      <PanelHeader current="settings" />

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-3xl">{t("settingsTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settingsSub")}</p>

        {/* La fila de saltos. Con cuatro grupos y una pantalla larga, encontrar
            "dónde cobro" no debería ser cuestión de recorrerla entera.

            Se construye con los grupos que de verdad se pintan, no con los
            cuatro siempre: a un mesero sólo le sale "Tu cuenta", y en el
            navegador los otros tres enlaces no hacían nada -- el ancla no
            existía en la página. Un control muerto es peor que uno ausente.
            Con un solo grupo no hay a dónde saltar y la fila desaparece. */}
        {jumps.length > 1 && (
          <nav className="sticky top-0 z-10 -mx-5 mt-4 flex gap-1.5 overflow-x-auto border-b border-border bg-background/95 px-5 py-3 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {jumps.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-border px-4 text-xs text-muted-foreground transition-colors hover:border-primary"
              >
                {label}
              </a>
            ))}
          </nav>
        )}

        {forbidden ? (
          <section className="surface mt-6 p-6">
            <p className="text-sm text-muted-foreground">{t("menuForbidden")}</p>
          </section>
        ) : loading ? (
          <div className="mt-6 space-y-6">
            {[0, 1].map((i) => (
              <section key={i} className="surface p-6">
                <div className="h-5 w-40 animate-pulse rounded bg-secondary" />
                <div className="mt-4 h-11 w-full animate-pulse rounded-lg bg-secondary" />
                <div className="mt-3 h-11 w-2/3 animate-pulse rounded-lg bg-secondary" />
              </section>
            ))}
          </div>
        ) : (
          <>
            {/* Lo que ve un cliente. Va primero porque es lo único de esta
                pantalla que sale de la puerta del local. */}
            <Group id="restaurante" title={t("settingsGroupRestaurant")}>
              <RestaurantName canEdit={role === "OWNER" || role === "MANAGER"} />
              <RestaurantBranding
                restaurantId={settings.data?.id}
                canEdit={role === "OWNER" || role === "MANAGER"}
              />
            </Group>

            {/* El dinero, junto y arriba. Estaba repartido: la moneda y los
                cargos aquí, y los datos de cobro al final de la pantalla,
                debajo del equipo. Son la misma decisión. */}
            <Group id="cobros" title={t("settingsGroupMoney")}>
              <PlanSection />

              <section className="surface mt-4 p-6">
                <h2 className="text-xl">{t("menuCurrency")}</h2>
                {settings.isError && <ErrorBox error={settings.error} fallback={t("apiDown")} />}
                <div className="mt-3 flex flex-wrap gap-2">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      disabled={setCurrency.isPending}
                      onClick={() => setCurrency.mutate(c)}
                      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors disabled:opacity-40 ${
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
                      <ConfirmButton
                        title={t("deleteOthersPermanently")}
                        description={t("permanentDeleteConfirm")}
                        confirmLabel={t("deleteOthersPermanently")}
                        onConfirm={() => cleanup.mutate("delete")}
                        disabled={cleanup.isPending}
                        className="rounded-full border border-destructive px-4 py-2 text-xs text-destructive disabled:opacity-40"
                      >
                        {t("deleteOthersPermanently")}
                      </ConfirmButton>
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

                      className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                    />
                    <span className="mt-1 block text-[11px] figure text-muted-foreground">
                      {formatBps(bpsFromInput(vat) ?? 0)} · {bpsFromInput(vat) ?? "—"} bps
                    </span>
                  </label>
                  <label className="text-sm">
                    <span className="text-muted-foreground">{t("serviceLabel")}</span>
                    <input
                      value={service}
                      inputMode="decimal"
                      onChange={(e) => setService(e.target.value)}

                      className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                    />
                    <span className="mt-1 block text-[11px] figure text-muted-foreground">
                      {formatBps(bpsFromInput(service) ?? 0)} · {bpsFromInput(service) ?? "—"} bps
                    </span>
                  </label>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">{t("ratesHint")}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
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

              {(role === "OWNER" || role === "MANAGER") && <PayoutSection />}
              {role === "OWNER" && <ProvidersSection />}
            </Group>

            <Group id="equipo" title={t("settingsGroupTeam")}>
              {(role === "OWNER" || role === "MANAGER") && meId && (
                <StaffManager me={{ id: meId, role }} />
              )}
            </Group>
          </>
        )}

        {/* Fuera del gate de rol, y a propósito: la contraseña y el segundo
            factor son de la persona que mira, no del restaurante. Un mesero no
            ve nada de lo de arriba y aun así tiene que poder cambiar la
            provisional que le dieron -- de hecho es quien más lo necesita.
            Estaban los primeros de la pantalla por accidente; van al final
            porque se usan una vez, no porque importen menos. */}
        <Group id="cuenta" title={t("settingsGroupAccount")}>
          <DisplayNameField />
          <ChangePassword />
          <MfaPanel />
        </Group>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Datos de cobro (Pago Móvil)</h2>
        {/* Un estado, no un formulario. Sin esto sólo se podía saber si estaba
            configurado leyendo si los cuatro campos tenían algo -- y el que
            falta es justo el que nadie mira. */}
        {accountQuery.data && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              accountQuery.data.payout
                ? "bg-primary/15 text-primary"
                : "border border-amber-500/50 text-muted-foreground"
            }`}
          >
            {accountQuery.data.payout ? t("payoutReady") : t("payoutMissing")}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Es lo que ve el comensal para pagarte. Splite nunca retiene el dinero: va de su banco al
        tuyo.
      </p>
      {accountQuery.data && !accountQuery.data.payout && (
        <p className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
          {t("setupPayoutWhy")}
        </p>
      )}
      {accountQuery.isError && <ErrorBox error={accountQuery.error} fallback={t("apiDown")} />}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted-foreground">Banco</span>
          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={field}>
            <option value="">—</option>
            {(banksQuery.data ?? []).map((b: BankRef) => (
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

const MERCANTIL_FIELDS = [
  "merchantId",
  "clientId",
  "secretKey",
  "integratorId",
  "terminalId",
] as const;

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

  const mercantil =
    (providersQuery.data ?? []).find((p: PaymentProviderConfig) => p.provider === "MERCANTIL") ??
    null;

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
