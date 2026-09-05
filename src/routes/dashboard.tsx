import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ConfigurationCard } from "@/components/panel/ConfigurationCard";
import { PanelIntro } from "@/components/panel/PanelIntro";
import { PendingCollection } from "@/components/panel/PendingCollection";
import { MetricCard } from "@/components/panel/MetricCard";
import { TableRow } from "@/components/panel/TableRow";
import { AttentionList } from "@/components/panel/AttentionList";
import { PaymentDrawer } from "@/components/panel/PaymentDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePayoutConfigured } from "@/lib/use-payout";
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
import { BillServerPicker, canAssignServer } from "@/components/BillServerPicker";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  auth,
  bills,
  errorFields,
  errorFieldsText,
  formatBps,
  GUEST_BASE_URL,
  isEphemeralGuestHost,
  formatFxRate,
  formatMinor,
  parseMinorInput,
  formatMoney,
  menu as menuApi,
  newIdempotencyKey,
  payments,
  staffSession,
  tables as tablesApi,
  type Bill,
  type MenuCurrency,
  type TillPaymentMethod,
} from "@/lib/api";
import { PanelHeader } from "@/components/PanelHeader";
import { formatDay } from "../lib/dates";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel del restaurante — Splite" },
      {
        name: "description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Panel del restaurante — Splite" },
      {
        property: "og:description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, lang, plural } = useI18n();
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

  // Avisos de pago que esperan verificación. Sólo respalda a la instantánea de
  // sala mientras carga: misma clave que el contador de la cabecera, así que
  // las dos son una consulta y no hay dos sondeos contando lo mismo.
  const claimsQuery = useQuery({
    queryKey: ["payment-claims", "summary"],
    queryFn: () => payments.claimsSummary(),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 20000,
  });
  const pendingCount = claimsQuery.data?.pending ?? 0;

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

  /**
   * La sala en una sola llamada.
   *
   * Los cuatro recuentos de arriba se sacaban a mano de tres listados, y el
   * dinero no se sacaba en absoluto: el cliente no hace aritmética con
   * importes, así que el panel podía decir cuántas mesas estaban ocupadas pero
   * no cuánto debían. Esto lo suma el servidor.
   *
   * Los listados siguen haciendo falta -- el plano dibuja las mesas y los
   * avisos llenan su panel -- pero las cifras ya no se derivan de ellos.
   */
  const snapshot = useQuery({
    queryKey: ["service-snapshot"],
    queryFn: () => payments.dashboard(),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 30000,
  });

  /**
   * Dar de alta la sala entera de una vez.
   *
   * Montarla mesa a mesa es el primer trabajo de cualquier restaurante nuevo y
   * el endpoint para hacerlo de golpe llevaba tiempo sin que nadie lo llamara.
   * Es idempotente y no borra: repetirlo con un número mayor añade sólo las que
   * faltan, así que no hay forma de perder una mesa con cuentas desde aquí.
   */
  const createTablesBulk = useMutation({
    mutationFn: () => tablesApi.createMany(Number(bulkCount)),
    onSuccess: (r) => {
      setBulkOpen(false);
      toast.success(
        r.alreadyExisted > 0
          ? `${r.created} mesa(s) creada(s). ${r.alreadyExisted} ya existían.`
          : `${r.created} mesa(s) creada(s).`,
      );
      void tablesQuery.refetch();
      void snapshot.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown")),
  });

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
  const selected = tableList.find((tb) => tb.id === selectedId) ?? tableList[0] ?? null;

  // Si el Pago Móvil de esta mesa puede llegar a alguna parte. Ver el aviso
  // junto al QR.
  const payoutReady = usePayoutConfigured();

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
  // Cómo entró el dinero. Se manda siempre: omitirlo dejaba que el servidor
  // pusiera `SPLITE` -- el método de un pago hecho dentro de la app -- en cobros
  // de caja, y con eso las propinas de esos cobros se iban a "sin clasificar"
  // en vez de a caja o a lo que se le debe al personal. Efectivo por defecto
  // porque es lo que más se teclea en una caja.
  const [payMethod, setPayMethod] = useState<TillPaymentMethod>("CASH");
  const [idemKey, setIdemKey] = useState(newIdempotencyKey());
  const [tillOpen, setTillOpen] = useState(false);

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
      // `parseMinorInput`, como en todas las demás casillas de dinero de la app.
      //
      // Antes esto era `amount.replace(/\D/g, "")`, que trata lo tecleado como
      // céntimos ya: escribir 2000 registraba 20,00 Bs en vez de 2.000,00 Bs, y
      // la cuenta apenas bajaba. Sólo salía bien si se escribían los decimales.
      const digits = parseMinorInput(amount);
      if (!digits || BigInt(digits) <= 0n) throw new Error("empty");
      // La misma clave se reutiliza en cada reintento del mismo intento de cobro.
      return bills.pay(bill!.id, digits, idemKey, { paymentMethod: payMethod });
    },
    onSuccess: (result) => {
      toast.success(`${t("takePayment")} · ${formatMinor(result.remaining)} Bs`);
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("10");

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
      queryClient.invalidateQueries({ queryKey: ["bills", "OPEN"] });
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
      queryClient.invalidateQueries({ queryKey: ["bills", "OPEN"] });
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
    queryClient.invalidateQueries({ queryKey: ["bills", "OPEN"] });
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

  // Mientras no haya llegado, los recuentos viejos siguen sirviendo: el panel no
  // debe quedarse en blanco esperando una llamada más.
  const snap = snapshot.data ?? null;

  if (!ready) return null;

  // El token ya contiene mesa y restaurante: la ruta no lleva el id (QR más corto).
  // El token puede contener caracteres no seguros en URL (+, /, =): hay que escaparlo.
  const guestUrl = qrQuery.data
    ? `${GUEST_BASE_URL}/t?qr=${encodeURIComponent(qrQuery.data.token)}`
    : "";
  // Si el enlace que llevaría el código cuelga de un host que va a caducar.
  const ephemeralHost = isEphemeralGuestHost();

  /**
   * La mesa abierta, tal y como se pinta debajo de su propia tarjeta.
   *
   * Extraída a una variable en vez de quedarse dentro del `return` porque
   * ahora se inserta *dentro* de la rejilla de mesas, detrás de la fila de
   * la mesa elegida, y no al final de la lista.
   */
  const tableDetail = selected ? (
    <div>
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
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-xs transition-colors hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("renameTable")}
            </button>
          )}
          {bill && (
            <button
              onClick={() => setCloseOpen(true)}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs transition-colors hover:bg-secondary"
            >
              {t("closeBill")}
            </button>
          )}
          {!bill && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-xs text-destructive transition-colors hover:bg-secondary"
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
          <div className="mt-2 border-b border-border pb-2">
            <BillServerPicker
              billId={bill.id}
              servedBy={bill.servedBy ?? null}
              canAssign={canAssignServer(me.data?.user.role)}
              onChanged={() => {
                void billQuery.refetch();
                void openBillsQuery.refetch();
              }}
            />
          </div>

          <ul className="mt-2 space-y-2 text-sm">
            {billItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span>
                  {item.quantity} × {item.name}
                </span>
                <span className="flex items-center gap-3">
                  <span className="figure">{formatMoney(item.subtotalMinor, bill.currency)}</span>

                  <button
                    onClick={() => removeLine.mutate(item.id)}
                    aria-label={t("remove")}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-destructive"
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

          {/* El diálogo se queda: lo abre ahora el botón "Añadir productos"
              de la fila de acciones, para no tener dos sitios desde donde
              hacer lo mismo. */}
          <AddProductsDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            products={productsQuery.data ?? []}
            billCurrency={bill.currency}
            pending={addLines.isPending}
            onConfirm={(lines) => addLines.mutate(lines)}
          />

          {(productsQuery.data ?? []).some((p) => p.active && p.currency !== bill.currency) && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t("currencyMismatchHint")}{" "}
              <Link to="/menu" className="underline">
                {t("manageMenu")}
              </Link>
            </p>
          )}

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
              <span className="figure text-3xl">{formatMoney(bill.remainingVes, "VES")}</span>
            </div>
            {/* Sólo cuando hay conversión de verdad. Una cuenta en bolívares
                no tiene tasa: enseñaba "Tasa congelada al abrir la cuenta: 1 ·
                Fecha valor" -- un 1 que no significa nada y una etiqueta sin
                fecha detrás, porque `fxValueDate` puede venir nula. Y la fecha
                salía en ISO, que es justo lo que se acaba de corregir en el
                resto de la aplicación. */}
            {bill.currency !== "VES" && (bill.fxRateVesPerUnit ?? bill.fxRate) && (
              <p className="pt-2 text-[11px] text-muted-foreground">
                {t("frozenRate")}: {formatFxRate(bill.fxRateVesPerUnit ?? bill.fxRate!)}
                {formatDay(bill.fxValueDate, lang)
                  ? ` · ${t("valueDate")} ${formatDay(bill.fxValueDate, lang)}`
                  : ""}
              </p>
            )}
          </div>

          {/* Las acciones de la mesa, juntas y por orden de importancia.
              Cobrar era un formulario al final de todo esto: en un teléfono
              había que bajar por las líneas, los totales y la tasa congelada
              con el cliente esperando. Ahora es el botón fuerte y el
              formulario se abre encima. */}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              onClick={() => setTillOpen(true)}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:flex-none"
            >
              {t("registerPayment")}
            </button>
            {productsQuery.isSuccess && productsQuery.data.length === 0 ? (
              <Link
                to="/menu"
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border px-5 text-sm transition-colors hover:bg-secondary"
              >
                <Plus className="h-4 w-4" /> {t("manageMenu")}
              </Link>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border px-5 text-sm transition-colors hover:bg-secondary"
              >
                <Plus className="h-4 w-4" /> {t("addProducts")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  ) : null;

  // El plano se vuelve a pedir cada ocho segundos; "En vivo" dice eso y no
  // otra cosa. Si esa consulta falla, se dice, en vez de dejar el punto verde
  // encendido sobre cifras congeladas.
  const live = tablesQuery.isSuccess && !tablesQuery.isError;

  const alerts =
    (snap?.claims.pending ?? pendingCount) +
    (snap ? snap.unresolvedC2P.inDoubt + snap.unresolvedC2P.ambiguous : unresolvedCount);

  return (
    <div className="min-h-screen">
      <PanelHeader current="dashboard" />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <PanelIntro live={live} />

        {(me.isError || tablesQuery.isError) && (
          <div className="surface mt-4 p-4">
            <p className="text-sm">{t("tablesCouldNotLoad")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("tryAgain")}</p>
            <button
              onClick={() => {
                void tablesQuery.refetch();
                void snapshot.refetch();
              }}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {/* Compacta y a lo ancho: desaparece sola en cuanto está todo, así que
            no se le reserva una columna para siempre. */}
        <div className="mt-6">
          <ConfigurationCard />
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* Lo operativo: cuánto se debe, cómo va el turno y las mesas. */}
          <div className="min-w-0 space-y-6">
            <PendingCollection
              outstandingVes={snap?.openBills.outstandingVes ?? null}
              openBills={snap?.openBills.count ?? null}
              loading={snapshot.isLoading && !snap}
            />

            {/* Tres cifras de contexto. "C2P sin resolver: 0" era una casilla
                permanente para un cero: ahora los avisos y los C2P sin
                resolver se suman en una sola, y sin nada pendiente dice que
                está todo al día en vez de subrayar el cero. */}
            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                label={t("kpiOpenTables")}
                value={
                  snap
                    ? `${snap.tables.occupied}/${snap.tables.total}`
                    : `${busyCount}/${tableList.length}`
                }
                loading={snapshot.isLoading && !snap}
              />
              <MetricCard
                label={t("kpiTakenTodayShort")}
                value={snap ? formatMoney(snap.taken.paymentsVes, "VES") : "—"}
                hint={
                  snap
                    ? `${snap.taken.payments} ${plural(snap.taken.payments, "payment")}`
                    : undefined
                }
                loading={snapshot.isLoading && !snap}
              />
              <MetricCard
                label={t("kpiAlerts")}
                value={alerts > 0 ? String(alerts) : "✓"}
                hint={alerts > 0 ? undefined : t("allClear")}
                tone={alerts > 0 ? "attention" : "neutral"}
                loading={snapshot.isLoading && !snap}
              />
            </div>

            {/* La antigüedad de la cuenta más vieja iba dentro de una frase
                larga junto a los cobros del día; aquí es su propio dato, que
                es como se lee de un vistazo. */}
            {snap?.openBills.oldestOpenedAt && (
              <p className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                <span>{t("oldestBillLabel")}</span>
                <span className="figure">{relativeAge(snap.openBills.oldestOpenedAt)}</span>
              </p>
            )}

            <section aria-labelledby="live-tables-heading">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                <h2 id="live-tables-heading" className="text-lg">
                  {t("liveTables")}
                </h2>
                {/* Los filtros que ya existían hacen de "ver todas": no hay
                    una pantalla de Mesas aparte, y no se inventa una. */}
                <div className="flex gap-1">
                  {(
                    [
                      ["ALL", `${t("seeAll")} (${tableList.length})`],
                      ["BUSY", `${t("tableOpenShort")} (${busyCount})`],
                      ["FREE", `${t("tableFreeShort")} (${tableList.length - busyCount})`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setFloorFilter(value)}
                      aria-pressed={floorFilter === value}
                      className={`min-h-11 whitespace-nowrap rounded-full px-3 text-xs transition-colors ${
                        floorFilter === value
                          ? "bg-secondary font-medium text-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {tablesQuery.isLoading ? (
                <div className="surface divide-y divide-border">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="px-4 py-3">
                      <Skeleton className="h-5 w-40" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="surface divide-y divide-border overflow-hidden">
                  {visibleTables.map((tb) => (
                    <Fragment key={tb.id}>
                      <TableRow
                        table={tb}
                        selected={selected?.id === tb.id}
                        onSelect={() => setSelectedId(tb.id)}
                        fallbackOpenedAt={
                          tb.openBill ? openedAtByBill.get(tb.openBill.id) : undefined
                        }
                      />
                      {/* El detalle va justo debajo de su mesa. Con una sola
                          columna ya no hace falta medir en qué fila cae la
                          tarjeta elegida. */}
                      {/* El detalle, dentro de la misma tarjeta que la lista.
                          Con su propio `surface` eran tres tarjetas anidadas:
                          la lista, la banda del detalle y el detalle. */}
                      {selected?.id === tb.id && (
                        <div className="bg-secondary/30 px-4 py-4">{tableDetail}</div>
                      )}
                    </Fragment>
                  ))}
                  {visibleTables.length === 0 && (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      {t("noTablesInFilter")}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Lo que no es del turno: avisos, el QR de la mesa elegida y el alta
              de mesas, que es trabajo de montaje y no de servicio. */}
          <div className="min-w-0 space-y-6">
            <AttentionList
              tables={tableList}
              unresolvedC2P={
                snap ? snap.unresolvedC2P.inDoubt + snap.unresolvedC2P.ambiguous : unresolvedCount
              }
              openedAtByBill={openedAtByBill}
            />

            <aside className="surface p-5 text-center">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {t("qrFor")}
              </p>
              <p className="mt-1 font-display text-2xl">{selected?.name ?? "—"}</p>
              <div id="qr-print-source" className="mt-4 flex justify-center">
                {guestUrl ? (
                  <QrCode value={guestUrl} size={200} />
                ) : (
                  <div className="h-[224px] w-[224px] rounded-lg bg-secondary" />
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t("qrScanHint")}</p>

              {/* Aquí y no en otro sitio: es el momento en que alguien está a
                  punto de imprimir un código y pegarlo en una mesa. Sin payee,
                  `guestPayee` devuelve null y el Pago Móvil de esa mesa no lleva
                  a ninguna parte -- y se descubre con el cliente ya sentado. */}
              {payoutReady === false && (
                <p className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-left text-[11px] text-muted-foreground">
                  {t("payoutMissingQr")}{" "}
                  <Link to="/settings" className="underline">
                    {t("payoutConfigure")}
                  </Link>
                </p>
              )}

              {qrQuery.isError && <ErrorBox error={qrQuery.error} fallback={t("forbidden")} />}
              {guestUrl && (
                <>
                  {/* Antes de imprimir nada: un código sacado de una vista
                      previa funciona hoy y deja de resolver cuando el host rota,
                      semanas después y ya pegado a una mesa. Avisar no basta --
                      el aviso se lee una vez y el papel dura meses -- así que
                      desde aquí no se imprime. */}
                  {ephemeralHost && (
                    <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs">
                      {t("qrEphemeralHost")}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
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
                      disabled={ephemeralHost}
                      title={ephemeralHost ? t("qrEphemeralHost") : undefined}
                      className="min-h-11 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      {t("printQr")}
                    </button>

                    {/* El enlace lleva el token de invitado: nunca se muestra. */}
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(guestUrl);
                          toast.success(t("linkCopied"));
                        } catch {
                          toast.error(t("apiDown"));
                        }
                      }}
                      className="min-h-11 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
                    >
                      {t("copyLink")}
                    </button>
                  </div>

                  {/* Abrir la mesa tal cual la abre el comensal. */}
                  <a
                    href={guestUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
                  >
                    <ExternalLink className="h-4 w-4" /> {t("previewOpenReal")}
                  </a>

                  <button
                    onClick={() => setRotateOpen(true)}
                    className="mt-2 min-h-11 w-full rounded-full px-4 text-xs text-muted-foreground transition-colors hover:bg-secondary"
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

            {/* Montar la sala es trabajo de una vez, no del turno: sigue aquí y
                sigue funcionando igual, pero plegado y al final. */}
            <Collapsible className="surface p-4">
              <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm">
                {t("manageTables")}
                <ChevronDown aria-hidden className="h-4 w-4 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder={t("tableName")}
                    aria-label={t("tableName")}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
                  />
                  <button
                    disabled={!newTableName.trim() || createTable.isPending}
                    onClick={() => createTable.mutate()}
                    className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" /> {t("createTable")}
                  </button>
                </div>

                <button
                  onClick={() => setBulkOpen((v) => !v)}
                  className="mt-2 min-h-11 whitespace-nowrap rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
                >
                  {bulkOpen ? t("cancel") : t("bulkCreate")}
                </button>

                {bulkOpen && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-secondary p-3">
                    <label className="grid gap-1">
                      <span className="text-xs text-muted-foreground">{t("bulkHowMany")}</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={bulkCount}
                        onChange={(e) => setBulkCount(e.target.value)}
                        className="min-h-11 w-28 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                      />
                    </label>
                    <button
                      disabled={
                        createTablesBulk.isPending ||
                        !(Number(bulkCount) >= 1 && Number(bulkCount) <= 200)
                      }
                      onClick={() => createTablesBulk.mutate()}
                      className="min-h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground disabled:opacity-40"
                    >
                      {createTablesBulk.isPending ? t("creating") : t("create")}
                    </button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </main>

      {/* El cobro, encima de todo. Misma mutación, misma clave de idempotencia
          y mismo parseo: sólo cambia dónde se teclea. */}
      {bill && selected && (
        <PaymentDrawer
          open={tillOpen}
          onOpenChange={setTillOpen}
          tableName={selected.name}
          remainingVes={bill.remainingVes}
          amount={amount}
          onAmountChange={setAmount}
          method={payMethod}
          onMethodChange={setPayMethod}
          onSubmit={() => payMutation.mutate()}
          pending={payMutation.isPending}
        />
      )}
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
      <span className="figure">{formatMoney(amount, currency)}</span>
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

/** Antigüedad legible de una cuenta abierta: la fecha la da el servidor, aquí sólo se formatea. */
function relativeAge(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
