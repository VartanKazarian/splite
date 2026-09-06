import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  auth,
  bills,
  errorFieldsText,
  formatBps,
  formatMoney,
  menu as menuApi,
  newIdempotencyKey,
  parseMinorInput,
  formatMinor,
  tables as tablesApi,
  type FloorTable,
  type MenuCurrency,
  type TillPaymentMethod,
} from "@/lib/api";
import { AddProductsDialog } from "@/components/AddProductsDialog";
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
  const { t } = useI18n();
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

  // Anular no es cerrar: el servidor lo rechaza en cuanto ha entrado dinero
  // ("reversing it is a refund, not a status change") y sólo lo admite de un
  // dueño o un encargado. Se enseña cuando puede funcionar, y si no, no está.
  const canVoid =
    paidVes === 0n && (me.data?.user.role === "OWNER" || me.data?.user.role === "MANAGER");

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

  const payMutation = useMutation({
    mutationFn: async () => {
      // `parseMinorInput`, como en todas las demás casillas de dinero de la app.
      const digits = parseMinorInput(amount);
      if (!digits || BigInt(digits) <= 0n) throw new Error("empty");
      // La misma clave se reutiliza en cada reintento del mismo intento de cobro.
      return bills.pay(bill!.id, digits, idemKey, { paymentMethod: payMethod });
    },
    onSuccess: (result) => {
      toast.success(`${t("takePayment")} · ${formatMinor(result.remaining)} Bs`);
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

  const addLines = useMutation({
    mutationFn: async (lines: { productId: string; quantity: number }[]) => {
      for (const line of lines) await bills.addItem(bill!.id, line.productId, line.quantity);
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
        ) : (
          <h3 className="text-lg">
            {bill ? t("openBill") : t("tableFree")} · {table.name}
          </h3>
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
                <LoadFailed onRetry={() => void itemsQuery.refetch()} />
              </li>
            )}
            {itemsQuery.isSuccess && billItems.length === 0 && (
              <li className="text-muted-foreground">{t("addLines")}</li>
            )}
          </ul>

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
          </div>

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
                ? t("payStateClaims").replace("{n}", String(pendingClaims))
                : remainingVes === 0n && paidVes > 0n
                  ? t("payStateSettled")
                  : paidVes > 0n
                    ? t("payStatePartial").replace(
                        "{amount}",
                        formatMoney(bill.remainingVes, "VES"),
                      )
                    : t("payStateWaiting")}
            </span>
            {pendingClaims > 0 && (
              <Link to="/pagos" className="ml-auto shrink-0 whitespace-nowrap underline">
                {t("payStateVerify")}
              </Link>
            )}
          </div>

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
            onSubmit={() => payMutation.mutate()}
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
