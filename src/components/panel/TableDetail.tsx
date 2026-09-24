import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Minus, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  auth,
  bills,
  errorFieldsText,
  formatBps,
  currencySymbol,
  formatFxRate,
  formatMoney,
  menu as menuApi,
  newIdempotencyKey,
  formatMinor,
  tables as tablesApi,
  type FloorTable,
  type MenuCurrency,
  type SettleReason,
  type TillPaymentMethod,
} from "@/lib/api";
import { ActivityFeed } from "@/components/ActivityFeed";
import { paidPercent } from "@/components/panel/tableStatus";
import { AddProductsSheet } from "@/components/panel/AddProductsSheet";
import { BillServerPicker, canAssignServer } from "@/components/BillServerPicker";
import { PaymentDrawer } from "@/components/panel/PaymentDrawer";
import { LoadFailed } from "@/components/shell/LoadFailed";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * Una mesa abierta por dentro: sus líneas, sus totales y qué se puede hacer.
 *
 * Vivía dentro del panel, en línea, y la pantalla de Mesas necesitaba lo mismo.
 * Copiarlo habría dejado dos cobros, dos formas de cerrar una cuenta y dos
 * sitios donde arreglar el siguiente fallo. Extraído tal cual: las mismas
 * llamadas, las mismas claves de consulta y la misma clave de idempotencia.
 *
 * Se trae sus propias consultas en vez de recibir veinte props. React Query las
 * comparte por clave, así que abrirlo desde el panel o desde Mesas no pide los
 * mismos datos dos veces.
 */
export function TableDetail({
  table,
  onDeleted,
}: {
  table: FloorTable;
  /** El panel deselecciona la mesa borrada; Mesas cierra su detalle. */
  onDeleted?: () => void;
}) {
  const { t, plural } = useI18n();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });

  const floorBill = table.openBill ?? null;

  // El plano sólo trae un resumen: IVA y servicio se recalculan en el detalle.
  const billQuery = useQuery({
    queryKey: ["bill", floorBill?.id],
    queryFn: () => bills.get(floorBill!.id),
    enabled: !!floorBill?.id,
    retry: false,
  });
  const bill = billQuery.data ?? floorBill;

  /**
   * Cómo va el cobro de esta mesa.
   *
   * Los avisos por verificar salen de `floorBill` y no de `bill`: los trae el
   * resumen de `/tables/floor` y `/bills/{id}` no los incluye, así que leerlos
   * del segundo los perdería en cuanto carga el detalle.
   *
   * El que importa es el ámbar. Los otros tres dicen en qué punto está; ése
   * dice que hay algo que hacer -- alguien declaró un Pago Móvil y nadie lo ha
   * comprobado todavía -- y es la única razón por la que un mesero tiene que
   * volver a esta mesa si el comensal paga desde el móvil.
   *
   * Lo que no se puede decir todavía es si lo pagado entró por la app o por
   * caja: la cuenta no trae el desglose por método. Así que se dice el importe
   * y no de dónde vino, en vez de afirmar algo que no se sabe.
   */
  const pendingClaims = floorBill?.pendingClaims ?? 0;
  const paidVes = (() => {
    try {
      return BigInt(bill?.amountPaidVes ?? "0");
    } catch {
      return 0n;
    }
  })();
  const remainingVes = (() => {
    try {
      return BigInt(bill?.remainingVes ?? "0");
    } catch {
      return 0n;
    }
  })();
  const paidPct = paidPercent(bill?.amountPaidVes, bill?.totalDueVes);

  // Anular no es cerrar: el servidor lo rechaza en cuanto ha entrado dinero
  // ("reversing it is a refund, not a status change") y sólo lo admite de un
  // dueño o un encargado. Se enseña cuando puede funcionar, y si no, no está.
  const isManagement = me.data?.user.role === "OWNER" || me.data?.user.role === "MANAGER";
  const canVoid = paidVes === 0n && isManagement;

  /**
   * Cerrarla con lo cobrado: para todo lo demás.
   *
   * Anular y cerrar no son lo mismo y por eso están las dos. Anular dice que
   * esta cuenta no debió existir -- se abrió por error --, y por eso sólo cabe
   * mientras no haya entrado nada. Cerrar dice que la mesa comió y que lo que
   * falta no se va a cobrar, que es lo que pasa de verdad cuando algo sale mal.
   */
  const canSettle = isManagement;

  // Las líneas no vienen dentro de la cuenta: se piden aparte.
  const itemsQuery = useQuery({
    queryKey: ["bill-items", bill?.id],
    queryFn: () => bills.items(bill!.id),
    enabled: !!bill?.id,
    retry: false,
  });
  const billItems = itemsQuery.data ?? [];

  const productsQuery = useQuery({
    queryKey: ["menu-products"],
    queryFn: () => menuApi.products(),
    retry: false,
  });

  // El backend es la autoridad del dinero: nunca se recalcula IVA, servicio ni total.
  const totals = {
    subtotal: bill?.subtotalMinor ?? "0",
    vat: bill?.vatMinor ?? "0",
    service: bill?.serviceChargeMinor ?? "0",
    total: bill?.totalDue ?? "0",
  };

  const fail = (error: unknown) => {
    if (!(error instanceof ApiError)) return toast.error(t("apiDown"));
    const fields = errorFieldsText(error);
    return toast.error(`${error.code} · ${fields || error.message}`);
  };

  const refreshBill = () => {
    queryClient.invalidateQueries({ queryKey: ["floor"] });
    queryClient.invalidateQueries({ queryKey: ["bills", "OPEN"] });
    queryClient.invalidateQueries({ queryKey: ["bill", bill?.id] });
    queryClient.invalidateQueries({ queryKey: ["bill-items", bill?.id] });
  };

  const [amount, setAmount] = useState("");
  // Cómo entró el dinero. Se manda siempre: omitirlo dejaba que el servidor
  // pusiera `SPLITE` -- el método de un pago hecho dentro de la app -- en cobros
  // de caja, y con eso las propinas de esos cobros se iban a "sin clasificar".
  const [payMethod, setPayMethod] = useState<TillPaymentMethod>("CASH");
  const [idemKey, setIdemKey] = useState(newIdempotencyKey());
  const [tillOpen, setTillOpen] = useState(false);

  // El reparto lo hace la hoja de cobro, que es donde están lo tecleado y lo
  // pendiente: `amountMinorUnits` es lo que va contra la cuenta y `tipMinorUnits`
  // lo que el cliente da de más y no quiere de vuelta.
  const payMutation = useMutation({
    mutationFn: async (split: { amountMinorUnits: string; tipMinorUnits: string }) => {
      if (BigInt(split.amountMinorUnits) <= 0n) throw new Error("empty");
      // La misma clave se reutiliza en cada reintento del mismo intento de cobro.
      return bills.pay(bill!.id, split.amountMinorUnits, idemKey, {
        paymentMethod: payMethod,
        tipMinorUnits: split.tipMinorUnits,
      });
    },
    onSuccess: (result, split) => {
      const tip = BigInt(split.tipMinorUnits);
      toast.success(
        `${t("takePayment")} · ${formatMinor(result.remaining)} Bs` +
          (tip > 0n ? ` · ${formatMinor(split.tipMinorUnits)} Bs ${t("tillTipToast")}` : ""),
      );
      setAmount("");
      setTillOpen(false);
      setIdemKey(newIdempotencyKey());
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      queryClient.invalidateQueries({ queryKey: ["bill", bill?.id] });
      queryClient.invalidateQueries({ queryKey: ["service-snapshot"] });
    },
    onError: (error) => {
      if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
      else toast.error(t("apiDown"));
    },
  });

  // Abrir con total 0 es lo que permite luego itemizar la cuenta con el menú.
  const openBill = useMutation({
    mutationFn: () => bills.open(table.id, "0"),
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
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleReason, setSettleReason] = useState<SettleReason>("WRITE_OFF");
  const [settleNote, setSettleNote] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const renameTable = useMutation({
    mutationFn: () => tablesApi.rename(table.id, renameValue.trim()),
    onSuccess: () => {
      setRenaming(false);
      toast.success(t("tableRenamed"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: fail,
  });

  // No existe DELETE de mesas: eliminar es desactivar (deja de salir en el plano).
  const deleteTable = useMutation({
    mutationFn: () => tablesApi.deactivate(table.id),
    onSuccess: () => {
      setDeleteOpen(false);
      toast.success(t("tableDeleted"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      onDeleted?.();
    },
    onError: fail,
  });

  const closeBill = useMutation({
    mutationFn: () => bills.void(bill!.id),
    onSuccess: () => {
      setCloseOpen(false);
      toast.success(t("billClosed"));
      refreshBill();
    },
    onError: fail,
  });

  /**
   * Cerrarla con lo cobrado, y dejar escrito lo que se deja de cobrar.
   *
   * Es el final de toda mesa que no cuadra al céntimo, que son casi todas las
   * que salen mal: la que se fue debiendo, la cortesía sobre una cuenta ya
   * cobrada en parte, el plato devuelto después de pagar. Hasta que existió,
   * ninguna de ésas se podía cerrar -- anular se rechaza en cuanto hay dinero
   * dentro -- y la mesa se quedaba ocupada en el plano para siempre.
   */
  const settleBill = useMutation({
    mutationFn: () =>
      bills.settle(bill!.id, {
        reason: settleReason,
        ...(settleNote.trim() ? { note: settleNote.trim() } : {}),
      }),
    onSuccess: (result) => {
      setSettleOpen(false);
      setSettleNote("");
      toast.success(
        result.adjustment
          ? t("settleDone").replace("{amount}", formatMoney(result.adjustment.amountVes, "VES"))
          : t("billClosed"),
      );
      refreshBill();
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      queryClient.invalidateQueries({ queryKey: ["service-snapshot"] });
    },
    onError: fail,
  });

  // La comanda entera en una llamada. Era un bucle de `await` con una petición
  // por producto: si la tercera fallaba, las dos primeras ya estaban en la
  // cuenta y nadie lo decía.
  const addLines = useMutation({
    mutationFn: (lines: { productId: string; quantity: number }[]) => bills.order(table.id, lines),
    onSuccess: () => {
      setPickerOpen(false);
      toast.success(t("lineAdded"));
      refreshBill();
    },
    onError: fail,
  });

  /**
   * Cambiar cuántas unidades lleva una línea.
   *
   * El servidor lo admitía desde siempre y el panel no lo usaba: para pasar de
   * dos asados a uno había que borrar la línea y volver a añadirla, y con
   * dinero ya aplicado ni eso -- borrarla bajaría el total por debajo de lo
   * cobrado y el servidor lo rechaza.
   */
  const setLineQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      bills.updateItem(bill!.id, itemId, quantity),
    onSuccess: refreshBill,
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {renaming ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={renameValue}
              maxLength={50}
              aria-label={t("renameTable")}
              onChange={(e) => setRenameValue(e.target.value)}
              className="min-h-11 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
            />
            <button
              disabled={!renameValue.trim() || renameTable.isPending}
              onClick={() => renameTable.mutate()}
              aria-label={t("save")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-primary disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setRenaming(false)}
              aria-label={t("cancel")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : // El nombre de la mesa no se repite: lo lleva la cabecera de la
        // hoja, justo encima. Y si la mesa está libre tampoco hace falta
        // decirlo aquí -- lo dice la píldora de la cabecera y lo repetía la
        // línea de abajo, tres veces lo mismo en cuarenta píxeles.
        bill ? (
          <h3 className="text-lg">{t("openBill")}</h3>
        ) : (
          <span />
        )}

        {/* Renombrar, anular y borrar bajan a un menú.
            Estaban los tres en fila junto al título, con el mismo peso que el
            cobro, y anular una cuenta es destructivo -- no es un vecino de
            "Renombrar mesa". Anular sólo aparece cuando puede funcionar: el
            servidor lo rechaza en cuanto ha entrado dinero y sólo lo admite de
            un dueño o un encargado, así que ofrecerlo el resto del tiempo es
            ofrecer un error. Una cuenta pagada del todo se cierra sola. */}
        {!renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("tableActions")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  setRenameValue(table.name);
                  setRenaming(true);
                }}
              >
                <Pencil className="h-4 w-4" /> {t("renameTable")}
              </DropdownMenuItem>
              {bill && canSettle && (
                <DropdownMenuItem className="cursor-pointer" onSelect={() => setSettleOpen(true)}>
                  <Check className="h-4 w-4" /> {t("settleBill")}
                </DropdownMenuItem>
              )}
              {/* Anular sigue abajo y en rojo: dice que esta cuenta no debió
                  existir, y por eso sólo cabe mientras no haya entrado nada. */}
              {bill && canVoid && (
                <DropdownMenuItem
                  className="cursor-pointer text-destructive"
                  onSelect={() => setCloseOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> {t("closeBill")}
                </DropdownMenuItem>
              )}
              {!bill && (
                <DropdownMenuItem
                  className="cursor-pointer text-destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> {t("deleteTable")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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

      {/* Cerrar con lo cobrado.
          El motivo se elige aquí y no se manda uno por defecto: es lo único que
          distingue una rebaja acordada de una cortesía y de dinero que no se va
          a cobrar, y son tres cosas distintas para quien lee el turno al final.
          La cifra que se va a perdonar está escrita en el propio texto, porque
          es la decisión que se está tomando. */}
      <AlertDialog open={settleOpen} onOpenChange={setSettleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settleTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {remainingVes > 0n
                ? t("settleBody")
                    .replace("{paid}", formatMoney(bill?.amountPaidVes ?? "0", "VES"))
                    .replace("{total}", formatMoney(bill?.totalDueVes ?? "0", "VES"))
                    .replace("{missing}", formatMoney(remainingVes.toString(), "VES"))
                : t("settleBodySquared")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {remainingVes > 0n && (
            <div className="space-y-2">
              {(
                [
                  ["WRITE_OFF", t("settleReasonWriteOff"), t("settleReasonWriteOffWhy")],
                  ["COMP", t("settleReasonComp"), t("settleReasonCompWhy")],
                  ["DISCOUNT", t("settleReasonDiscount"), t("settleReasonDiscountWhy")],
                ] as [SettleReason, string, string][]
              ).map(([value, label, why]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settleReason === value}
                  onClick={() => setSettleReason(value)}
                  className={`flex w-full min-h-12 items-center gap-3 rounded-lg border px-3 text-left transition-colors ${
                    settleReason === value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{why}</span>
                  </span>
                </button>
              ))}

              <label className="block pt-1">
                <span className="text-xs text-muted-foreground">{t("settleNote")}</span>
                <input
                  value={settleNote}
                  maxLength={280}
                  placeholder={t("settleNotePlaceholder")}
                  onChange={(event) => setSettleNote(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
                />
              </label>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={settleBill.isPending}
              onClick={(event) => {
                // Sin esto el diálogo se cierra antes de que la llamada vuelva,
                // y un fallo se quedaría sin nadie a quien contárselo.
                event.preventDefault();
                settleBill.mutate();
              }}
            >
              {settleBill.isPending ? t("loading") : t("settleBill")}
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
          <p className="text-sm text-muted-foreground">{t("oneOpenBill")}</p>
          <button
            disabled={openBill.isPending}
            onClick={() => openBill.mutate()}
            className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> {t("openNewBill")}
          </button>
        </div>
      )}

      {bill && (
        <>
          {/* Sin rótulo. "LÍNEAS DE LA CUENTA" encabezaba una lista de líneas
              que ya se reconoce a simple vista, y encima lo primero que había
              debajo no era una línea sino quién atendió la mesa. La regla
              separa igual. */}
          <div className="mt-4 border-t border-border pt-4">
            <BillServerPicker
              billId={bill.id}
              servedBy={bill.servedBy ?? null}
              canAssign={canAssignServer(me.data?.user.role)}
              onChanged={() => {
                void billQuery.refetch();
                queryClient.invalidateQueries({ queryKey: ["bills", "OPEN"] });
              }}
            />
          </div>

          {/* Cada línea con su cantidad, no sólo con una papelera. Cambiar de
              dos asados a uno costaba borrar la línea y volver a añadirla -- y
              con dinero ya aplicado ni eso: borrarla bajaría el total por
              debajo de lo cobrado y el servidor lo rechaza.
              El menos se convierte en papelera en la última unidad: es el mismo
              sitio para el dedo y dice lo que va a pasar, en vez de sumar un
              tercer botón a cada línea. */}
          <ul className="mt-2 space-y-2 text-sm">
            {billItems.map((item) => {
              const busy = setLineQuantity.isPending || removeLine.isPending;
              const last = item.quantity <= 1;
              return (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">{item.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="figure shrink-0">
                      {formatMoney(item.subtotalMinor, bill.currency)}
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-full border border-border">
                      <button
                        disabled={busy}
                        onClick={() =>
                          last
                            ? removeLine.mutate(item.id)
                            : setLineQuantity.mutate({
                                itemId: item.id,
                                quantity: item.quantity - 1,
                              })
                        }
                        aria-label={`${last ? t("remove") : t("oneLessOf")} ${item.name}`}
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 ${
                          last ? "text-destructive" : ""
                        }`}
                      >
                        {last ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-4 w-4" />}
                      </button>
                      <span className="figure w-6 text-center">{item.quantity}</span>
                      <button
                        disabled={busy || item.quantity >= 999}
                        onClick={() =>
                          setLineQuantity.mutate({ itemId: item.id, quantity: item.quantity + 1 })
                        }
                        aria-label={`${t("oneMoreOf")} ${item.name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </span>
                  </span>
                </li>
              );
            })}
            {itemsQuery.isError && (
              <li>
                <LoadFailed onRetry={() => void itemsQuery.refetch()} />
              </li>
            )}
            {itemsQuery.isSuccess && billItems.length === 0 && (
              <li className="text-muted-foreground">{t("addLines")}</li>
            )}
          </ul>

          <AddProductsSheet
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
            {/* El puente entre las dos monedas. Con la carta en dólares, el
                total sale en $ y lo pagado y lo que falta en Bs, y sin la tasa
                no hay forma de ver que 81,90 $ y 69.812,94 Bs son la misma
                cuenta. La tasa es la congelada de esta cuenta, no la de hoy. */}
            {bill.currency !== "VES" && (bill.fxRateVesPerUnit ?? bill.fxRate) && (
              <MoneyRow
                label={t("totalInVesAtRate")
                  .replace("{rate}", formatFxRate((bill.fxRateVesPerUnit ?? bill.fxRate)!))
                  .replace("{symbol}", currencySymbol(bill.currency))}
                amount={bill.totalDueVes}
                currency="VES"
              />
            )}
            <MoneyRow label={t("alreadyPaid")} amount={bill.amountPaidVes} currency="VES" />

            <div className="flex items-baseline justify-between pt-2 text-foreground">
              <span>{t("outstanding")}</span>
              <span className="money-xl">{formatMoney(bill.remainingVes, "VES")}</span>
            </div>
          </div>

          {/* Cuánto se lleva cobrado, en una barra.
              La fila de la lista de mesas ya la tenía y esta hoja no, que es al
              revés de lo que hace falta: la lista es de dónde mirar, y aquí es
              donde alguien decide si cobra, si espera o si cierra. Estaban los
              tres importes y una frase, y de tres números en columna no sale
              «va por la mitad» de un vistazo.

              La barra es presentación: la proporción exacta está escrita
              encima, en palabras y con su símbolo. Por eso lleva su etiqueta
              dicha para un lector de pantalla y no depende del color. */}
          {paidPct > 0 && (
            <div
              role="progressbar"
              aria-valuenow={paidPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("paidProgress")
                .replace("{paid}", formatMoney(bill.amountPaidVes, "VES"))
                .replace("{total}", formatMoney(bill.totalDueVes, "VES"))}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          )}

          {/* En qué punto está el cobro, debajo del importe.
              Cuatro estados y sólo uno pide algo: los avisos por verificar. */}
          <div
            className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              pendingClaims > 0
                ? "bg-amber-500/10 text-amber-800"
                : remainingVes === 0n && paidVes > 0n
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-muted-foreground"
            }`}
          >
            <span>
              {pendingClaims > 0
                ? plural(pendingClaims, "payStateClaims").replace("{n}", String(pendingClaims))
                : remainingVes === 0n && paidVes > 0n
                  ? t("payStateSettled")
                  : paidVes > 0n
                    ? // Sin la cifra: "faltan 3.630,00 Bs" iba pegado debajo de
                      // ese mismo importe escrito en el tamaño más grande de la
                      // hoja. La franja dice en qué punto está el cobro; cuánto
                      // falta lo dice el número de arriba.
                      t("payStatePartial")
                    : t("payStateWaiting")}
            </span>
            {pendingClaims > 0 && (
              <Link to="/pagos" className="ml-auto shrink-0 whitespace-nowrap underline">
                {t("payStateVerify")}
              </Link>
            )}
          </div>

          {/* Qué ha entrado y cuándo, en esta cuenta.
              La franja de arriba dice en qué punto está el cobro y los importes
              dicen cuánto; lo que faltaba es el cuándo. «¿Entró ya el pago que
              me acaban de decir?» se respondía yendo a Pagos y buscando la mesa
              entre las de todos. Es el mismo listado del servidor, filtrado por
              esta cuenta -- no hay un endpoint por mesa --, así que son los
              movimientos recientes y no el histórico. Sin ninguno no se dibuja. */}
          <ActivityFeed billId={bill.id} />

          {/* Añadir productos es lo que se hace en la mesa; cobrar es la
              excepción desde que el comensal paga con el QR. Estaban al revés:
              el verde sólido era el cobro. Se cambian de sitio y de peso, y el
              cobro dice cuándo hace falta en vez de dejarlo a la intuición. */}
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            {productsQuery.isSuccess && productsQuery.data.length === 0 ? (
              <Link
                to="/menu"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> {t("manageMenu")}
              </Link>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> {t("addProducts")}
              </button>
            )}

            <div>
              <button
                onClick={() => setTillOpen(true)}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-6 text-sm transition-colors hover:bg-secondary"
              >
                <CreditCard className="h-4 w-4" /> {t("registerPayment")}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{t("payHint")}</p>
            </div>
          </div>

          <PaymentDrawer
            open={tillOpen}
            onOpenChange={setTillOpen}
            tableName={table.name}
            remainingVes={bill.remainingVes}
            amount={amount}
            onAmountChange={setAmount}
            method={payMethod}
            onMethodChange={setPayMethod}
            onSubmit={(split) => payMutation.mutate(split)}
            pending={payMutation.isPending}
          />
        </>
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
