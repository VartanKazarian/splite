import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { SetupChecklist } from "@/components/SetupChecklist";
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

/**
 * La última tarjeta de la fila en la que está la tarjeta elegida.
 *
 * Hace falta porque el detalle de la mesa se mete *dentro* de la rejilla: para
 * que empuje a las demás hacia abajo tiene que ir detrás de la última tarjeta
 * de su fila, no detrás de la suya -- en dos columnas, un panel a lo ancho
 * colocado detrás de la tarjeta izquierda se baja a la fila siguiente y deja la
 * derecha vacía.
 *
 * Se mide de la geometría de las propias tarjetas: las que comparten fila
 * comparten `offsetTop`. La primera versión contaba las columnas con
 * `getComputedStyle(...).gridTemplateColumns`, y en el navegador salía mal: si
 * la hoja de estilos todavía no había llegado, la rejilla aún no era una
 * rejilla, la cuenta se quedaba en 1 y nada la volvía a mirar. La posición real
 * no tiene ese problema -- es lo que el navegador ya ha calculado, y no depende
 * de saber qué dicen las clases.
 */
function useRowEndIndex(
  gridRef: React.RefObject<HTMLElement | null>,
  selectedIndex: number,
  revision: unknown,
): number {
  const [rowEnd, setRowEnd] = useState(-1);

  const measure = useCallback(() => {
    const grid = gridRef.current;
    const cards = grid ? Array.from(grid.querySelectorAll<HTMLElement>("[data-table-card]")) : [];
    const chosen = selectedIndex >= 0 ? cards[selectedIndex] : undefined;
    if (!chosen) {
      setRowEnd((current) => (current === -1 ? current : -1));
      return;
    }
    let last = selectedIndex;
    // Un pixel de tolerancia: los redondeos del layout no son motivo para
    // partir una fila en dos.
    while (
      last + 1 < cards.length &&
      Math.abs((cards[last + 1] as HTMLElement).offsetTop - chosen.offsetTop) <= 1
    ) {
      last += 1;
    }
    setRowEnd((current) => (current === last ? current : last));
  }, [gridRef, selectedIndex]);

  // `useLayoutEffect` y no `useEffect`: se mide y se coloca antes de pintar, de
  // modo que el panel no aparece un fotograma en el sitio equivocado.
  useLayoutEffect(() => {
    measure();
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    // Cambiar de ancho recoloca las tarjetas, y volver a medir es barato: es lo
    // unico que mantiene el panel en su fila al girar el telefono.
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [measure, gridRef, revision]);

  return rowEnd;
}

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
  const partiallyPaid = tableList.filter(
    (tb) => tb.openBill && (tb.openBill.amountPaidVes ?? "0") !== "0",
  ).length;
  const selected = tableList.find((tb) => tb.id === selectedId) ?? tableList[0] ?? null;

  // Detrás de qué tarjeta va el detalle: la última de la fila de la mesa
  // elegida, no la suya. Ver `useRowEndIndex`.
  // Si el Pago Móvil de esta mesa puede llegar a alguna parte. Ver el aviso
  // junto al QR.
  const payoutReady = usePayoutConfigured();

  const floorGrid = useRef<HTMLDivElement>(null);
  const selectedIndex = visibleTables.findIndex((tb) => tb.id === selected?.id);
  // La lista de mesas es lo que hay que volver a medir cuando cambia: filtrar
  // "ocupadas" mueve todas las tarjetas de sitio.
  const detailAfterIndex = useRowEndIndex(floorGrid, selectedIndex, visibleTables);

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

  /**
   * La mesa abierta, tal y como se pinta debajo de su propia tarjeta.
   *
   * Extraída a una variable en vez de quedarse dentro del `return` porque
   * ahora se inserta *dentro* de la rejilla de mesas, detrás de la fila de
   * la mesa elegida, y no al final de la lista.
   */
  const tableDetail = selected ? (
    <div className="surface p-6">
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
            {(productsQuery.data ?? []).some((p) => p.active && p.currency !== bill.currency) && (
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
              <span className="font-display text-3xl">{formatMoney(bill.remainingVes, "VES")}</span>
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
                inputMode="decimal"
                placeholder="2.500,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
              />
              <button
                disabled={
                  payMutation.isPending || !amount || BigInt(parseMinorInput(amount) || "0") <= 0n
                }
                onClick={() => payMutation.mutate()}
                className="whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                {t("takePayment")}
              </button>
            </div>
            {/* Cómo entró el dinero. No es una etiqueta: el informe de propinas
                reparte por aquí -- efectivo está en caja, tarjeta y
                transferencia se le deben al personal -- y sin esto todo se
                registraba como pago de la app y caía en "sin clasificar". */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["CASH", "Efectivo"],
                  ["CARD", "Tarjeta"],
                  ["TRANSFER", "Transferencia"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPayMethod(value)}
                  aria-pressed={payMethod === value}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    payMethod === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Lo que se va a registrar, antes de pulsar. Esta casilla
                        leía lo tecleado como céntimos y nadie podía verlo. */}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {amount && BigInt(parseMinorInput(amount) || "0") > 0n
                ? `Se registrarán ${formatMinor(parseMinorInput(amount))} Bs.`
                : t("tillAmountHint")}
            </p>
            <p className="mt-2 break-all text-[10px] text-muted-foreground">
              {t("idemKey")}: {idemKey} — {t("idemNote")}
            </p>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="min-h-screen">
      <PanelHeader current="dashboard" />

      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-3xl">{t("dashboard")}</h1>

        {(me.isError || tablesQuery.isError) && (
          <ErrorBox error={(me.error ?? tablesQuery.error) as unknown} fallback={t("apiDown")} />
        )}

        {/* Arriba de los recuentos, y sólo mientras falte algo: son las paredes
            contra las que choca un comensal, no cifras del turno. */}
        <SetupChecklist />

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t("kpiOpenTables")}
            value={
              snap
                ? `${snap.tables.occupied}/${snap.tables.total}`
                : `${busyCount}/${tableList.length}`
            }
          />
          {/* Lo que la sala debe ahora mismo. Antes no se podía enseñar: son
              sumas de importes, y eso lo hace el servidor. */}
          <StatCard
            label={t("kpiOutstanding")}
            value={snap ? formatMoney(snap.openBills.outstandingVes, "VES") : "—"}
          />
          <StatCard
            label={t("kpiClaims")}
            value={String(snap?.claims.pending ?? pendingCount)}
            alert={(snap?.claims.pending ?? pendingCount) > 0}
          />
          <StatCard
            label={t("kpiC2P")}
            value={String(
              snap ? snap.unresolvedC2P.inDoubt + snap.unresolvedC2P.ambiguous : unresolvedCount,
            )}
            alert={
              (snap ? snap.unresolvedC2P.inDoubt + snap.unresolvedC2P.ambiguous : unresolvedCount) >
              0
            }
          />
        </div>

        {snap && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("kpiTakenToday")
              .replace("{n}", String(snap.taken.payments))
              .replace("{amount}", formatMoney(snap.taken.paymentsVes, "VES"))}
            {BigInt(snap.taken.tipsVes) > 0n && (
              <> · {formatMoney(snap.taken.tipsVes, "VES")} en propinas</>
            )}
            {snap.openBills.oldestOpenedAt && (
              <>{t("kpiOldestBill").replace("{age}", relativeAge(snap.openBills.oldestOpenedAt))}</>
            )}
          </p>
        )}

        {/* `min-w-0` en los hijos no es cosmético. Un hijo de grid trae
            `min-width: auto`, así que se niega a encogerse por debajo del ancho
            mínimo de su contenido: la fila de "Crear mesa / Crear varias" medía
            472px en un teléfono de 393 y estiraba la página entera. Todo lo de
            debajo -- las tarjetas de mesa, los filtros, el detalle -- heredaba
            ese ancho y quedaba descuadrado y cortado por la derecha. */}
        <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl">{t("tables")}</h2>
              {/* Se envuelve y el campo ocupa la fila entera cuando no cabe:
                  en un móvil el nombre de la mesa y sus dos botones no entran
                  en la misma línea, y forzarlo era lo que desbordaba. */}
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <input
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder={t("tableName")}
                  className="min-w-0 flex-1 rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring sm:flex-none"
                />
                <button
                  disabled={!newTableName.trim() || createTable.isPending}
                  onClick={() => createTable.mutate()}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" /> {t("createTable")}
                </button>
                <button
                  onClick={() => setBulkOpen((v) => !v)}
                  className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  {bulkOpen ? t("cancel") : t("bulkCreate")}
                </button>
              </div>
            </div>

            {bulkOpen && (
              <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-secondary p-3">
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("bulkHowMany")}</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                    className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </label>
                <button
                  disabled={
                    createTablesBulk.isPending ||
                    !(Number(bulkCount) >= 1 && Number(bulkCount) <= 200)
                  }
                  onClick={() => createTablesBulk.mutate()}
                  className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40"
                >
                  {createTablesBulk.isPending ? t("creating") : t("create")}
                </button>
                <p className="w-full text-[11px] text-muted-foreground">
                  Crea «Mesa 1» hasta «Mesa {Number(bulkCount) || 0}». Las que ya existan se dejan
                  como están y no se borra ninguna.
                </p>
              </div>
            )}

            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["ALL", `Todas (${tableList.length})`],
                  ["BUSY", `Ocupadas (${busyCount})`],
                  ["FREE", `Libres (${tableList.length - busyCount})`],
                ] as const
              ).map(([value, label]) => (
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

            {tablesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            )}
            <div ref={floorGrid} className="grid gap-3 sm:grid-cols-2">
              {visibleTables.map((tb, index) => {
                const ob = tb.openBill;
                const openedAt = ob ? openedAtByBill.get(ob.id) : undefined;
                return (
                  <Fragment key={tb.id}>
                    <button
                      data-table-card=""
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
                            <span className="text-foreground">
                              {formatMinor(ob.remainingVes)} Bs.
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{ob.itemCount ?? 0} líneas</span>
                            <span>{openedAt ? relativeAge(openedAt) : "—"}</span>
                          </div>
                        </div>
                      )}
                    </button>
                    {/* El detalle, dentro de la rejilla y a lo ancho, detrás de la
                      última tarjeta de la fila de la mesa elegida: así aparece
                      debajo de su mesa y empuja las demás hacia abajo, en vez
                      de aparecer al final de toda la lista. */}
                    {index === detailAfterIndex && (
                      <div className="sm:col-span-2">{tableDetail}</div>
                    )}
                  </Fragment>
                );
              })}
              {!tablesQuery.isLoading && visibleTables.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("noTablesInFilter")}</p>
              )}
            </div>
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
                    semanas después y ya pegado a una mesa. */}
                {isEphemeralGuestHost() && (
                  <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                    {t("qrEphemeralHost")}
                  </p>
                )}

                {/* Abrir la mesa tal cual la abre el comensal. Es el único
                    sitio donde se puede comprobar la cuenta de verdad: la
                    vista previa del panel enseña la carta, porque la cuenta
                    necesita consumo y una sesión y no se pueden inventar. */}
                <a
                  href={guestUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm transition-colors hover:bg-secondary"
                >
                  <ExternalLink className="h-4 w-4" /> {t("previewOpenReal")}
                </a>

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

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`surface p-4 ${alert ? "border-primary" : ""}`}>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl tabular-nums ${alert ? "text-primary" : ""}`}>
        {value}
      </p>
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
