import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, LogOut, Pencil, Plus, Trash2, Settings, TrendingUp, UtensilsCrossed, X } from "lucide-react";
import { toast } from "sonner";

import { QrCode } from "@/components/QrCode";
import { AddProductsDialog } from "@/components/AddProductsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  auth,
  bills,
  errorFields,
  errorFieldsText,
  formatBps,
  formatFxRate,
  formatMinor,
  formatMoney,
  menu as menuApi,
  newIdempotencyKey,
  payments,
  staffSession,
  tables as tablesApi,
  type Bill,
  type MenuCurrency,
} from "@/lib/api";




export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel del restaurante — Splite" },
      {
        name: "description",
        content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Panel del restaurante — Splite" },
      { property: "og:description", content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia." },
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

  // Avisos de pago que esperan verificación: el badge es lo que hace que alguien los mire.
  const claimsQuery = useQuery({
    queryKey: ["payment-claims", "PENDING"],
    queryFn: () => payments.claims("PENDING"),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 20000,
  });
  const pendingCount = claimsQuery.data?.length ?? 0;

  // Cargos C2P que el banco dejó en duda: son los que exigen intervención humana.
  const c2pQuery = useQuery({
    queryKey: ["c2p-unresolved"],
    queryFn: () => payments.c2pUnresolved(),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 30000,
  });
  const unresolvedCount = c2pQuery.data?.length ?? 0;

  // El plano no trae la fecha de apertura: la antigüedad sólo la da el listado de cuentas.
  const openBillsQuery = useQuery({
    queryKey: ["bills", "OPEN"],
    queryFn: () => bills.list("OPEN"),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 30000,
  });
  const openedAtByBill = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of openBillsQuery.data ?? []) if (b.createdAt) map.set(b.id, b.createdAt);
    return map;
  }, [openBillsQuery.data]);

  const [floorFilter, setFloorFilter] = useState<"ALL" | "BUSY" | "FREE">("ALL");

  const tableList = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);
  const visibleTables = useMemo(
    () =>
      tableList.filter((tb) =>
        floorFilter === "ALL" ? true : floorFilter === "BUSY" ? !!tb.openBill : !tb.openBill,
      ),
    [tableList, floorFilter],
  );
  const busyCount = tableList.filter((tb) => tb.openBill).length;
  const partiallyPaid = tableList.filter(
    (tb) => tb.openBill && (tb.openBill.amountPaidVes ?? "0") !== "0",
  ).length;
  const selected = tableList.find((tb) => tb.id === selectedId) ?? tableList[0] ?? null;



  // El token QR es permanente por mesa: se pide una sola vez y sólo se
  // vuelve a pedir tras rotar el nonce.
  const qrQuery = useQuery({
    queryKey: ["qr", selected?.id],
    enabled: Boolean(selected),
    retry: false,
    queryFn: () => tablesApi.qrToken(selected!.id),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  const [rotateOpen, setRotateOpen] = useState(false);


  const [amount, setAmount] = useState("");
  const [idemKey, setIdemKey] = useState(newIdempotencyKey());

  const floorBill = selected?.openBill ?? null;

  // El plano sólo trae un resumen: IVA y servicio se recalculan en el detalle.
  const billQuery = useQuery({
    queryKey: ["bill", floorBill?.id],
    queryFn: () => bills.get(floorBill!.id),
    enabled: ready && !!floorBill?.id,
    retry: false,
  });

  const bill = billQuery.data ?? floorBill;



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
      queryClient.invalidateQueries({ queryKey: ["bill", bill?.id] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error(`${error.code} · ${error.message}`);
      } else {
        toast.error(t("apiDown"));
      }
    },
  });

  const fail = (error: unknown) => {
    if (!(error instanceof ApiError)) return toast.error(t("apiDown"));
    const fields = errorFieldsText(error);
    return toast.error(`${error.code} · ${fields || error.message}`);
  };

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

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const renameTable = useMutation({
    mutationFn: () => tablesApi.rename(selected!.id, renameValue.trim()),
    onSuccess: () => {
      setRenaming(false);
      toast.success(t("tableRenamed"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: fail,
  });

  // No existe DELETE de mesas: eliminar es desactivar (deja de salir en el plano).
  const deleteTable = useMutation({
    mutationFn: () => tablesApi.deactivate(selected!.id),
    onSuccess: () => {
      setDeleteOpen(false);
      setSelectedId(null);
      toast.success(t("tableDeleted"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: fail,
  });

  const closeBill = useMutation({
    mutationFn: () => bills.void(bill!.id),
    onSuccess: () => {
      setCloseOpen(false);
      toast.success(t("billClosed"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      queryClient.invalidateQueries({ queryKey: ["bill", bill?.id] });
    },
    onError: fail,
  });

  const productsQuery = useQuery({
    queryKey: ["menu-products"],
    queryFn: () => menuApi.products(),
    enabled: ready && me.isSuccess,
    retry: false,
  });

  // Las líneas no vienen dentro de la cuenta: se piden aparte a /bills/{id}/items.
  const itemsQuery = useQuery({
    queryKey: ["bill-items", bill?.id],
    queryFn: () => bills.items(bill!.id),
    enabled: ready && !!bill?.id,
    retry: false,
  });
  const billItems = itemsQuery.data ?? [];

  // El backend es la autoridad del dinero: nunca se recalcula IVA, servicio ni total.
  const totals = {
    subtotal: bill?.subtotalMinor ?? "0",
    vat: bill?.vatMinor ?? "0",
    service: bill?.serviceChargeMinor ?? "0",
    total: bill?.totalDue ?? "0",
  };



  const refreshBill = () => {
    queryClient.invalidateQueries({ queryKey: ["floor"] });
    queryClient.invalidateQueries({ queryKey: ["bill", bill?.id] });
    queryClient.invalidateQueries({ queryKey: ["bill-items", bill?.id] });
  };


  const [pickerOpen, setPickerOpen] = useState(false);

  const addLines = useMutation({
    mutationFn: async (lines: { productId: string; quantity: number }[]) => {
      for (const line of lines) {
        await bills.addItem(bill!.id, line.productId, line.quantity);
      }
    },
    onSuccess: () => {
      setPickerOpen(false);
      toast.success(t("lineAdded"));
      refreshBill();
    },
    onError: fail,
  });


  const removeLine = useMutation({
    mutationFn: (itemId: string) => bills.removeItem(bill!.id, itemId),
    onSuccess: () => {
      toast.success(t("lineRemoved"));
      refreshBill();
    },
    onError: fail,
  });


  if (!ready) return null;


  // El token ya contiene mesa y restaurante: la ruta no lleva el id (QR más corto).
  // El token puede contener caracteres no seguros en URL (+, /, =): hay que escaparlo.
  const guestUrl = qrQuery.data
    ? `https://splite.lovable.app/t?qr=${encodeURIComponent(qrQuery.data.token)}`
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Link
              to="/menu"
              className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary sm:flex-none"
            >
              <UtensilsCrossed className="h-4 w-4" /> {t("manageMenu")}
            </Link>
            <Link
              to="/tasas"
              className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary sm:flex-none"
            >
              <TrendingUp className="h-4 w-4" /> {t("fxRates")}
            </Link>
            <Link
              to="/pagos"
              className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary sm:flex-none"
            >
              <BadgeCheck className="h-4 w-4" /> Pagos
              {pendingCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
                  {pendingCount}
                </span>
              )}
            </Link>

            <Link
              to="/settings"
              className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary sm:flex-none"
            >
              <Settings className="h-4 w-4" /> {t("settings")}
            </Link>
            <button
              onClick={async () => {
                await auth.logout();
                queryClient.clear();
                navigate({ to: "/" });
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary sm:flex-none"
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

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Mesas ocupadas" value={`${busyCount}/${tableList.length}`} />
          <StatCard label="Cuentas con pago parcial" value={String(partiallyPaid)} />
          <StatCard label="Avisos por verificar" value={String(pendingCount)} alert={pendingCount > 0} />
          <StatCard label="C2P sin resolver" value={String(unresolvedCount)} alert={unresolvedCount > 0} />
        </div>

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

            <div className="mb-3 flex flex-wrap gap-2">
              {([
                ["ALL", `Todas (${tableList.length})`],
                ["BUSY", `Ocupadas (${busyCount})`],
                ["FREE", `Libres (${tableList.length - busyCount})`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFloorFilter(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    floorFilter === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tablesQuery.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleTables.map((tb) => {
                const ob = tb.openBill;
                const openedAt = ob ? openedAtByBill.get(ob.id) : undefined;
                return (
                  <button
                    key={tb.id}
                    onClick={() => setSelectedId(tb.id)}
                    className={`surface p-5 text-left transition-colors hover:border-primary ${
                      selected?.id === tb.id ? "border-primary" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-2xl">{tb.name}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          ob ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {ob ? t("statusOPEN") : t("tableFree")}
                      </span>
                    </div>
                    {ob && (
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground tabular-nums">
                        <div className="flex justify-between">
                          <span>{t("total")}</span>
                          <span className="text-foreground">
                            {formatMoney(ob.totalDue, ob.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pendiente</span>
                          <span className="text-foreground">{formatMinor(ob.remainingVes)} Bs.</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{ob.itemCount ?? 0} líneas</span>
                          <span>{openedAt ? relativeAge(openedAt) : "—"}</span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
              {!tablesQuery.isLoading && visibleTables.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin mesas en este filtro.</p>
              )}
            </div>


            {selected && (
              <div className="surface mt-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {renaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={renameValue}
                        maxLength={50}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
                      />
                      <button
                        disabled={!renameValue.trim() || renameTable.isPending}
                        onClick={() => renameTable.mutate()}
                        aria-label={t("save")}
                        className="rounded-full border border-border p-2 text-primary disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setRenaming(false)}
                        aria-label={t("cancel")}
                        className="rounded-full border border-border p-2"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <h2 className="text-xl">
                      {t("openBill")} · {selected.name}
                    </h2>
                  )}
                  <div className="flex items-center gap-2">
                    {!renaming && (
                      <button
                        onClick={() => {
                          setRenameValue(selected.name);
                          setRenaming(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                      >
                        <Pencil className="h-3.5 w-3.5" /> {t("renameTable")}
                      </button>
                    )}
                    {bill && (
                      <button
                        onClick={() => setCloseOpen(true)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                      >
                        {t("closeBill")}
                      </button>
                    )}
                    {!bill && (
                      <button
                        onClick={() => setDeleteOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-secondary"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("deleteTable")}
                      </button>
                    )}
                  </div>
                </div>

                <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("closeBill")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("closeBillConfirm")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => closeBill.mutate()}>
                        {t("closeBill")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deleteTable")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("deleteTableConfirm")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteTable.mutate()}>
                        {t("deleteTable")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

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
                      {billItems.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3">
                          <span>
                            {item.quantity} × {item.name}
                          </span>
                          <span className="flex items-center gap-3">
                            <span>{formatMoney(item.subtotalMinor, bill.currency)}</span>

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
                      {itemsQuery.isError && (
                        <li>
                          <ErrorBox error={itemsQuery.error} fallback={t("apiDown")} />
                        </li>
                      )}
                      {itemsQuery.isSuccess && billItems.length === 0 && (
                        <li className="text-muted-foreground">{t("addLines")}</li>
                      )}
                    </ul>

                    <div className="mt-4 border-t border-border pt-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {t("addLines")}
                      </p>
                      {productsQuery.isSuccess && productsQuery.data.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t("menuEmptyHint")}{" "}
                          <Link to="/menu" className="underline">
                            {t("manageMenu")}
                          </Link>
                        </p>
                      ) : (
                        <button
                          onClick={() => setPickerOpen(true)}
                          className="mt-2 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-primary"
                        >
                          <Plus className="h-4 w-4" /> {t("chooseProducts")}
                        </button>
                      )}
                      {(productsQuery.data ?? []).some(
                        (p) => p.active && p.currency !== bill.currency,
                      ) && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {t("currencyMismatchHint")}{" "}
                          <Link to="/menu" className="underline">
                            {t("manageMenu")}
                          </Link>
                        </p>
                      )}

                      <AddProductsDialog
                        open={pickerOpen}
                        onOpenChange={setPickerOpen}
                        products={productsQuery.data ?? []}
                        billCurrency={bill.currency}
                        pending={addLines.isPending}
                        onConfirm={(lines) => addLines.mutate(lines)}
                      />
                    </div>



                    <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
                      <MoneyRow label={t("subtotal")} amount={totals.subtotal} currency={bill.currency} />
                      <MoneyRow
                        label={`${t("iva")} ${formatBps(bill.vatBps)}`}
                        amount={totals.vat}
                        currency={bill.currency}
                      />
                      <MoneyRow
                        label={`${t("service")} ${formatBps(bill.serviceChargeBps)}`}
                        amount={totals.service}
                        currency={bill.currency}
                      />
                      <MoneyRow label={t("total")} amount={totals.total} currency={bill.currency} highlight />
                      <MoneyRow label={t("alreadyPaid")} amount={bill.amountPaidVes} currency="VES" />

                      <div className="flex items-baseline justify-between pt-2 text-foreground">
                        <span>{t("outstanding")}</span>
                        <span className="font-display text-3xl">
                          {formatMoney(bill.remainingVes, "VES")}
                        </span>
                      </div>
                      {(bill.fxRateVesPerUnit ?? bill.fxRate) && (
                        <p className="pt-2 text-[11px] text-muted-foreground">
                          {t("frozenRate")}: {formatFxRate(bill.fxRateVesPerUnit ?? bill.fxRate!)} ·{" "}
                          {t("valueDate")} {bill.fxValueDate}
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
            <div id="qr-print-source" className="mt-5 flex justify-center animate-fade-in">
              {guestUrl ? (
                <QrCode value={guestUrl} size={240} />
              ) : (
                <div className="h-[264px] w-[264px] rounded-lg bg-secondary" />
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("qrScanHint")}</p>
            {qrQuery.isError && <ErrorBox error={qrQuery.error} fallback={t("forbidden")} />}
            {guestUrl && (
              <>
                {/* El enlace lleva el token de invitado: nunca se muestra en pantalla. */}
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(guestUrl);
                      toast.success(t("linkCopied"));
                    } catch {
                      toast.error(t("apiDown"));
                    }
                  }}
                  className="mt-4 w-full rounded-full border border-border px-5 py-3 text-sm transition-colors hover:bg-secondary"
                >
                  {t("copyLink")}
                </button>

                <button
                  onClick={() => {
                    const svg = document
                      .getElementById("qr-print-source")
                      ?.querySelector("svg")?.outerHTML;
                    if (!svg) {
                      toast.error(t("apiDown"));
                      return;
                    }
                    const win = window.open("", "_blank", "width=720,height=900");
                    if (!win) {
                      toast.error(t("apiDown"));
                      return;
                    }
                    const name = (selected?.name ?? "").replace(/[<>&]/g, "");
                    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>QR ${name}</title>
<style>
  @page { margin: 16mm; }
  body { margin:0; font-family: Georgia, serif; color:#111;
         display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card { text-align:center; border:2px solid #2C7A5C; border-radius:24px; padding:32px 40px; }
  .name { font-size:34px; margin:0 0 4px; }
  .kicker { font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:#8a8a8a; margin:0 0 18px; }
  .qr svg { width:320px; height:320px; }
  .hint { margin-top:18px; font-size:14px; color:#444; }
</style></head><body><div class="card">
  <p class="kicker">${t("qrFor")}</p>
  <h1 class="name">${name}</h1>
  <div class="qr">${svg}</div>
  <p class="hint">${t("qrScanHint")}</p>
</div><script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`);
                    win.document.close();
                  }}
                  className="mt-4 w-full rounded-full border border-border px-5 py-3 text-sm transition-colors hover:bg-secondary"
                >
                  {t("printQr")}
                </button>



                <button
                  onClick={() => setRotateOpen(true)}
                  className="mt-4 w-full rounded-full border border-border px-5 py-3 text-sm transition-colors hover:bg-secondary"
                >
                  {t("refreshQr")}
                </button>

                <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("refreshQr")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("rotateQrWarning")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await tablesApi.rotateQr(selected!.id);
                            await qrQuery.refetch();
                            toast.success(t("refreshQr"));
                          } catch (error) {
                            toast.error(error instanceof ApiError ? error.code : t("apiDown"));
                          }
                        }}
                      >
                        {t("continue")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

function MoneyRow({
  label,
  amount,
  currency,
  highlight,
}: {
  label: string;
  amount: string;
  currency: MenuCurrency;
  highlight?: boolean;
}) {
  return (
    <div className={`flex justify-between ${highlight ? "text-foreground" : ""}`}>
      <span>{label}</span>
      <span>{formatMoney(amount, currency)}</span>
    </div>
  );
}


export function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  const api = error instanceof ApiError ? error : null;
  const fields = Object.entries(errorFields(error));
  return (
    <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
      <p className="font-medium text-destructive">{api?.code ?? "NETWORK_ERROR"}</p>
      <p className="mt-1 text-muted-foreground">{api?.message ?? fallback}</p>
      {fields.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {fields.map(([field, message]) => (
            <li key={field}>
              <span className="text-destructive">{field}</span>: {message}
            </li>
          ))}
        </ul>
      )}
      {api?.requestId && (
        <p className="mt-1 break-all text-[10px] text-muted-foreground">
          Request ID: {api.requestId}
        </p>
      )}
    </div>
  );
}
