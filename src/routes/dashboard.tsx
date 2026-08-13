import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { LogOut, Plus, RefreshCw, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { LangToggle } from "@/components/LangToggle";
import { QrCode } from "@/components/QrCode";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  auth,
  bills,
  exchangeRate,
  formatMinor,
  menu as menuApi,
  newIdempotencyKey,
  staffSession,
  tables as tablesApi,
  type Bill,
} from "@/lib/api";


export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel del restaurante — Mesa" },
      {
        name: "description",
        content: "Mesas abiertas, códigos QR, cuentas y pagos en tiempo real del restaurante.",
      },
      { property: "og:title", content: "Panel del restaurante — Mesa" },
      { property: "og:description", content: "Mesas abiertas, QR, cuentas y pagos en vivo." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!staffSession.get()) navigate({ to: "/login" });
    else setReady(true);
  }, [navigate]);

  // En cada arranque: /auth/me. Nunca /auth/refresh para saber quién es.
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => auth.me(),
    enabled: ready,
    retry: false,
  });

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      staffSession.set(null);
      navigate({ to: "/login" });
    }
  }, [me.error, navigate]);

  // Un solo GET del plano: cada mesa trae su openBill (null = mesa libre).
  const tablesQuery = useQuery({
    queryKey: ["floor"],
    queryFn: () => tablesApi.floor(),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 8000,
  });

  const tableList = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);
  const selected = tableList.find((tb) => tb.id === selectedId) ?? tableList[0] ?? null;

  const qrQuery = useQuery({
    queryKey: ["qr", selected?.id],
    enabled: Boolean(selected),
    retry: false,
    queryFn: () => tablesApi.qrToken(selected!.id),
  });

  // La tasa sólo tras cargar el token: antes de auth devolvía 401.
  const rateQuery = useQuery({
    queryKey: ["fx"],
    queryFn: exchangeRate,
    enabled: ready && me.isSuccess,
    retry: false,
  });

  const [amount, setAmount] = useState("");
  const [idemKey, setIdemKey] = useState(newIdempotencyKey());

  const bill = selected?.openBill ?? null;

  const payMutation = useMutation({
    mutationFn: async () => {
      const digits = amount.replace(/\D/g, "");
      if (!digits) throw new Error("empty");
      // La misma clave se reutiliza en cada reintento del mismo intento de cobro.
      return bills.pay(bill!.id, digits, idemKey);
    },
    onSuccess: (result) => {
      toast.success(`${t("takePayment")} · ${formatMinor(result.remaining)} Bs.`);
      setAmount("");
      setIdemKey(newIdempotencyKey());
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error(`${error.code} · ${error.message}`);
      } else {
        toast.error(t("apiDown"));
      }
    },
  });

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown"));

  const [newTableName, setNewTableName] = useState("");

  const createTable = useMutation({
    mutationFn: () => tablesApi.create(newTableName.trim()),
    onSuccess: (table) => {
      setNewTableName("");
      setSelectedId(table.id);
      toast.success(t("tableCreated"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: fail,
  });

  // Abrir con total 0 es lo que permite luego itemizar la cuenta con el menú.
  const openBill = useMutation({
    mutationFn: () => bills.open(selected!.id, "0"),
    onSuccess: () => {
      toast.success(t("billOpened"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: fail,
  });

  const productsQuery = useQuery({
    queryKey: ["menu-products"],
    queryFn: () => menuApi.products(),
    enabled: ready && me.isSuccess,
    retry: false,
  });

  const addLine = useMutation({
    mutationFn: (productId: string) => bills.addItem(bill!.id, productId, 1),
    onSuccess: () => {
      toast.success(t("lineAdded"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: fail,
  });

  const removeLine = useMutation({
    mutationFn: (itemId: string) => bills.removeItem(bill!.id, itemId),
    onSuccess: () => {
      toast.success(t("lineRemoved"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: fail,
  });

  if (!ready) return null;


  const guestUrl =
    typeof window !== "undefined" && selected && qrQuery.data
      ? `${window.location.origin}/t/${selected.id}?qr=${qrQuery.data.token}`
      : "";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <Link to="/" className="font-display text-2xl">
              {t("brand")}
            </Link>
            {me.data && (
              <span className="ml-3 text-sm text-muted-foreground">
                {t("signedInAs")} {me.data.user.email} · {t(`role${me.data.user.role}` as never)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/menu"
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              <UtensilsCrossed className="h-4 w-4" /> {t("manageMenu")}
            </Link>
            <LangToggle />

            <button
              onClick={async () => {
                await auth.logout();
                queryClient.clear();
                navigate({ to: "/" });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" /> {t("logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-3xl">{t("dashboard")}</h1>

        {(me.isError || tablesQuery.isError) && (
          <ErrorBox error={(me.error ?? tablesQuery.error) as unknown} fallback={t("apiDown")} />
        )}

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl">{t("tables")}</h2>
              <div className="flex gap-2">
                <input
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder={t("tableName")}
                  className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
                />
                <button
                  disabled={!newTableName.trim() || createTable.isPending}
                  onClick={() => createTable.mutate()}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" /> {t("createTable")}
                </button>
              </div>
            </div>
            {tablesQuery.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
            <div className="grid gap-3 sm:grid-cols-2">


              {tableList.map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setSelectedId(tb.id)}
                  className={`surface p-5 text-left transition-colors hover:border-primary ${
                    selected?.id === tb.id ? "border-primary" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-2xl">{tb.name}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        tb.active ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {tb.active ? t("statusOPEN") : t("free")}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {selected && (
              <div className="surface mt-6 p-6">
                <h2 className="text-xl">
                  {t("openBill")} · {selected.name}
                </h2>

                {!bill && (
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">
                      {t("tableFree")} · {t("oneOpenBill")}
                    </p>
                    <button
                      disabled={openBill.isPending}
                      onClick={() => openBill.mutate()}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" /> {t("openNewBill")}
                    </button>
                  </div>
                )}


                {bill && (
                  <>
                    <p className="mt-4 border-t border-border pt-4 text-xs uppercase tracking-widest text-muted-foreground">
                      {t("itemsOnBill")}
                    </p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {(bill.items ?? []).map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3">
                          <span>
                            {item.quantity} × {item.name}
                          </span>
                          <span className="flex items-center gap-3">
                            <span>
                              {item.currency} {formatMinor(item.subtotalMinor)}
                            </span>
                            <button
                              onClick={() => removeLine.mutate(item.id)}
                              aria-label={t("remove")}
                              className="rounded-full border border-border p-1.5 text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </li>
                      ))}
                      {(bill.items ?? []).length === 0 && (
                        <li className="text-muted-foreground">{t("addLines")}</li>
                      )}
                    </ul>

                    <div className="mt-4 border-t border-border pt-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {t("addLines")}
                      </p>
                      {productsQuery.isSuccess && productsQuery.data.length === 0 && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t("menuEmptyHint")}{" "}
                          <Link to="/menu" className="underline">
                            {t("manageMenu")}
                          </Link>
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(productsQuery.data ?? [])
                          .filter((p) => p.active)
                          .map((p) => (
                            <button
                              key={p.id}
                              disabled={addLine.isPending}
                              onClick={() => addLine.mutate(p.id)}
                              className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary disabled:opacity-40"
                            >
                              + {p.name} · {p.currency} {formatMinor(p.priceMinorUnits)}
                            </button>
                          ))}
                      </div>
                    </div>


                    <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
                      <Row label={t("subtotal")} value={formatMinor(bill.subtotalMinor)} />
                      <Row
                        label={`${t("iva")} ${bill.vatBps / 100}%`}
                        value={formatMinor(bill.vatMinor)}
                      />
                      <Row
                        label={`${t("service")} ${bill.serviceChargeBps / 100}%`}
                        value={formatMinor(bill.serviceChargeMinor)}
                      />
                      <Row label={t("alreadyPaid")} value={formatMinor(bill.amountPaidVes)} />
                      <div className="flex items-baseline justify-between pt-2">
                        <span>{t("outstanding")}</span>
                        <span className="font-display text-3xl">
                          Bs. {formatMinor(bill.remainingVes)}
                        </span>
                      </div>
                      {bill.fxRate && (
                        <p className="pt-2 text-[11px] text-muted-foreground">
                          {t("frozenRate")}: {bill.fxRate} · {t("valueDate")} {bill.fxValueDate}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 border-t border-border pt-4">
                      <label className="text-xs uppercase tracking-widest text-muted-foreground">
                        {t("chargeAmount")}
                      </label>
                      <div className="mt-2 flex gap-2">
                        <input
                          inputMode="numeric"
                          placeholder="250000"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                        />
                        <button
                          disabled={payMutation.isPending || !amount}
                          onClick={() => payMutation.mutate()}
                          className="whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
                        >
                          {t("takePayment")}
                        </button>
                      </div>
                      <p className="mt-2 break-all text-[10px] text-muted-foreground">
                        {t("idemKey")}: {idemKey} — {t("idemNote")}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="surface h-fit p-6 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("qrFor")}</p>
            <p className="mt-1 font-display text-3xl">{selected?.name ?? "—"}</p>
            <div className="mt-5 flex justify-center">
              <QrCode value={guestUrl || "splite"} size={168} />
            </div>
            {qrQuery.isError && <ErrorBox error={qrQuery.error} fallback={t("forbidden")} />}
            {guestUrl && (
              <>
                <a
                  href={guestUrl}
                  className="mt-4 block break-all text-[10px] text-muted-foreground underline"
                >
                  {guestUrl}
                </a>
                <button
                  onClick={async () => {
                    try {
                      await tablesApi.rotateQr(selected!.id);
                      qrQuery.refetch();
                      toast.success(t("refreshQr"));
                    } catch (error) {
                      toast.error(error instanceof ApiError ? error.code : t("apiDown"));
                    }
                  }}
                  className="mt-4 w-full rounded-full border border-border px-5 py-3 text-sm transition-colors hover:bg-secondary"
                >
                  {t("refreshQr")}
                </button>
              </>
            )}
          </aside>
        </section>

        <section className="mt-8 surface p-6">
          <h2 className="text-xl">{t("exchangeRate")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("fxSource")}</p>
          {rateQuery.isError && <ErrorBox error={rateQuery.error} fallback={t("apiDown")} />}
          <ul className="mt-4 space-y-2 text-sm">
            {Object.entries(rateQuery.data?.rates ?? {}).map(([code, r]) => (
              <li key={code} className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">
                  {code} · {t("valueDate")} {r.valueDate ?? "—"} · {r.source}
                </span>
                <span>{r.rate} Bs.</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("settlementVes")} · {t("settlementNote")}
          </p>
        </section>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>Bs. {value}</span>
    </div>
  );
}

export function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  const api = error instanceof ApiError ? error : null;
  return (
    <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
      <p className="font-medium text-destructive">{api?.code ?? "NETWORK_ERROR"}</p>
      <p className="mt-1 text-muted-foreground">{api?.message ?? fallback}</p>
      {api?.requestId && (
        <p className="mt-1 break-all text-[10px] text-muted-foreground">
          Request ID: {api.requestId}
        </p>
      )}
    </div>
  );
}
