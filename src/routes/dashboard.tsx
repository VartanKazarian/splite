import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

import { ConfigurationCard } from "@/components/panel/ConfigurationCard";
import { PanelIntro } from "@/components/panel/PanelIntro";
import { MetricCard } from "@/components/panel/MetricCard";
import { TableRow } from "@/components/panel/TableRow";
import { openMinutesOf, toneOf } from "@/components/panel/tableStatus";
import { TableDetailSheet } from "@/components/panel/TableDetailSheet";
import { ToAttend } from "@/components/panel/ToAttend";
import { EmptyState } from "@/components/shell/EmptyState";
import { OrderTray } from "@/components/panel/OrderTray";
import { PaymentDrawer } from "@/components/panel/PaymentDrawer";
import { Skeleton } from "@/components/ui/skeleton";
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
  formatMinor,
  parseMinorInput,
  formatMoney,
  menu as menuApi,
  newIdempotencyKey,
  orders,
  payments,
  staffSession,
  tables as tablesApi,
  type Bill,
  type ServiceSnapshot,
  type TillPaymentMethod,
} from "@/lib/api";
import { PanelHeader } from "@/components/PanelHeader";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel del restaurante — Splite" },
      {
        name: "description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      { property: "og:title", content: "Panel del restaurante — Splite" },
      {
        property: "og:description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
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

  // El resumen de avisos de pago ya no se pide aquí. Lo alimentaba la tarjeta
  // "Avisos", que ha desaparecido; la franja de "Por atender" cuenta los avisos
  // por mesa, del mismo plano que ya dibuja la lista, y así puede además decir
  // de qué mesa es cuando hay uno solo. El contador de la cabecera sigue con
  // su propia consulta, que es de donde salía la clave compartida.

  // Cargos C2P que el banco dejó en duda: son los que exigen intervención humana.
  const c2pQuery = useQuery({
    queryKey: ["c2p-unresolved"],
    queryFn: () => payments.c2pUnresolved(),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 30000,
  });
  const unresolvedCount = c2pQuery.data?.length ?? 0;

  // Pedidos que la sala no ha mirado. Cuentan como avisos porque son
  // exactamente eso: algo que ha pasado en una mesa y que alguien tiene que
  // atender. El resumen y no la lista -- la bandeja de abajo trae las comandas
  // enteras y esto sólo alimenta un número.
  const ordersQuery = useQuery({
    queryKey: ["orders", "summary"],
    queryFn: () => orders.summary(),
    enabled: ready && me.isSuccess,
    retry: false,
    refetchInterval: 20000,
  });
  const newOrders = ordersQuery.data?.pending ?? 0;

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

  const tableList = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);
  const busyCount = tableList.filter((tb) => tb.openBill).length;

  /**
   * Sólo las mesas que piden algo, y las que más piden primero.
   *
   * El panel pintaba el plano entero con sus fichas de filtro: catorce filas
   * de las que nueve decían "Libre", 2.396 px de pantalla en un teléfono, y
   * luego la sección de Mesas volvía a enseñar exactamente lo mismo con un
   * buscador encima. Una mesa libre no pide nada -- ni cobrarla, ni mirarla,
   * ni abrirla desde aquí -- así que aquí no está: el plano completo, con su
   * búsqueda y sus filtros, vive en Mesas, y desde aquí se va con un enlace.
   *
   * El orden tampoco es el del plano. Primero lo que hay que atender (un pago
   * declarado sin verificar, una cuenta que lleva doce horas abierta), y
   * dentro de cada grupo la más vieja arriba: es el mismo criterio con el que
   * la tarjeta de arriba manda a "la cuenta más antigua", y evita de paso que
   * "Mesa 10" salga antes que "Mesa 2" por orden alfabético.
   */
  const openTables = useMemo(() => {
    const urgency = (tb: (typeof tableList)[number]) => (toneOf(tb) === "attention" ? 0 : 1);
    const age = (tb: (typeof tableList)[number]) =>
      tb.openBill ? (openMinutesOf(tb.openBill, openedAtByBill.get(tb.openBill.id)) ?? 0) : 0;
    return tableList
      .filter((tb) => tb.openBill)
      .sort((a, b) => urgency(a) - urgency(b) || age(b) - age(a));
  }, [tableList, openedAtByBill]);

  /*
   * La mesa elegida, y sólo si de verdad la han elegido.
   *
   * Caía a `tableList[0]` cuando no había ninguna, que servía mientras el
   * detalle se pintaba en línea -- había que enseñar algo en ese hueco. Ahora
   * abre una hoja encima, y con el respaldo la hoja salía sola al cargar el
   * panel, sobre la primera mesa de la lista.
   */
  const selected = selectedId ? (tableList.find((tb) => tb.id === selectedId) ?? null) : null;

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

  // El plano se vuelve a pedir cada ocho segundos; "En vivo" dice eso y no
  // otra cosa. Si esa consulta falla, se dice, en vez de dejar el punto verde
  // encendido sobre cifras congeladas.
  const live = tablesQuery.isSuccess && !tablesQuery.isError;

  // Cargos que el banco dejó en duda. Del resumen del servidor cuando ha
  // llegado, y del listado mientras tanto.
  const inDoubt = snap
    ? snap.unresolvedC2P.inDoubt + snap.unresolvedC2P.ambiguous
    : unresolvedCount;

  return (
    <div className="min-h-screen">
      <PanelHeader current="dashboard" />

      {/* Una columna, y con el ancho de Menú y de Pagos. Eran dos, pero la
          estrecha sólo llevaba la lista de "Atención" -- que ya no existe --, y
          en un teléfono esa columna caía por debajo de todo, que es el último
          sitio donde poner lo que hay que atender. */}
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
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

        {/* Lo primero que se mira, y sólo si existe. Ver `ToAttend`. */}
        <div className="mt-6 space-y-6">
          <ToAttend
            orders={newOrders}
            tables={tableList}
            unresolvedC2P={inDoubt}
            openedAtByBill={openedAtByBill}
            onOrders={() =>
              document
                .getElementById("order-tray-heading")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />

          <div className="min-w-0 space-y-6">
            {/* Tres cifras de contexto, y ninguna pide nada: son el fondo del
                turno. Lo que pide algo está arriba, en la franja, con una
                línea y un destino por tipo.
                "Pendiente de cobro" tenía tarjeta propia y un botón,
                "Gestionar", que abría *una* mesa: con tres abiertas, cuál era
                una decisión del panel y no de quien mira. Lo mismo hacía la
                fila "Cuenta más antigua · Ir a la cuenta". Las dos se han ido;
                la lista de abajo ya sale ordenada por urgencia, que es la
                forma no arbitraria de decir por dónde empezar.
                La cifra se queda, en fila con las otras dos: la tarjeta grande
                repetía además "3 abiertas", que es lo que dice "Mesas ocupadas
                3/8" justo debajo. */}
            {/* Las tres filas -- rótulo, cifra, apostilla -- se definen aquí y
                no dentro de cada tarjeta: así una cifra no se hunde porque su
                rótulo ocupe dos líneas. Ver `MetricCard`. */}
            <div className="grid gap-3 sm:grid-cols-3 sm:grid-rows-[auto_auto_auto]">
              {/* La antigüedad de la cuenta más vieja sobrevive como apostilla
                  de lo pendiente, que es a lo que se refiere. Dato, no
                  destino. */}
              <MetricCard
                label={t("pendingCollection")}
                value={snap ? formatMoney(snap.openBills.outstandingVes, "VES") : "—"}
                hint={
                  snap?.openBills.oldestOpenedAt
                    ? t("oldestHint").replace("{age}", relativeAge(snap.openBills.oldestOpenedAt))
                    : undefined
                }
                loading={snapshot.isLoading && !snap}
              />
              <MetricCard
                label={t("kpiOpenTables")}
                value={
                  snap
                    ? `${snap.tables.occupied}/${snap.tables.total}`
                    : `${busyCount}/${tableList.length}`
                }
                loading={snapshot.isLoading && !snap}
              />
              {/* "Cobros hoy" sonaba a lo que teclea el personal, que es
                  justo la mitad que este número no es. Y debajo, de qué mitad
                  viene: un turno en el que la mayoría se tecleó en caja es un
                  turno en el que el QR no funcionó. */}
              <MetricCard
                label={t("kpiTakenTodayShort")}
                value={snap ? formatMoney(snap.taken.paymentsVes, "VES") : "—"}
                hint={snap ? salesHint(snap.taken, t) : undefined}
                loading={snapshot.isLoading && !snap}
              />
            </div>

            {/* Encima de las mesas: es lo que acaba de pasar, y lo de abajo es
                el estado. Desaparece sola cuando no hay nada. */}
            <OrderTray onOpenTable={(tableId) => setSelectedId(tableId)} />

            <section aria-labelledby="live-tables-heading">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                <h2 id="live-tables-heading" className="text-lg">
                  {t("liveTables")}
                </h2>
                {/* La salida al plano completo. Las fichas de filtro se han ido
                    con él: filtrar una lista que ya sólo trae lo abierto es
                    filtrar por lo único que hay. */}
                {tableList.length > 0 && (
                  <Link
                    to="/mesas"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary"
                  >
                    {t("allTablesLink").replace("{n}", String(tableList.length))}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>

              {tablesQuery.isLoading ? (
                <div className="surface divide-y divide-border">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="px-4 py-3">
                      <Skeleton className="h-5 w-40" />
                    </div>
                  ))}
                </div>
              ) : openTables.length === 0 ? (
                <div className="surface">
                  <EmptyState title={t("noOpenTables")} hint={t("noOpenTablesHint")} />
                </div>
              ) : (
                <div className="surface divide-y divide-border overflow-hidden">
                  {openTables.map((tb) => (
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
                    </Fragment>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* El detalle, encima del panel y no dentro de la lista. Y con él el
          QR, que vivía siempre abierto en la columna de la derecha: 529 px de
          los 2.335 de esta pantalla en un móvil, para un código que se imprime
          una vez y se pega a una mesa. Era además una segunda copia del panel
          de QR, con su propia función de imprimir, mientras `TableQrDialog`
          ya existía. Ver `TableDetailSheet`. */}
      <TableDetailSheet
        table={selected}
        open={Boolean(selected)}
        onOpenChange={(v) => !v && setSelectedId(null)}
        onDeleted={() => setSelectedId(null)}
      />

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
        <p className="mt-1 break-all text-[11px] text-muted-foreground">
          Request ID: {api.requestId}
        </p>
      )}
    </div>
  );
}

/** Antigüedad legible de una cuenta abierta: la fecha la da el servidor, aquí sólo se formatea. */
/**
 * De dónde vino lo cobrado hoy.
 *
 * Dos cifras y no tres mientras el tercer cubo esté vacío, que es lo normal:
 * `unclassified` son cobros de caja anteriores a que el cliente empezara a
 * decir el método, así que en un turno de hoy no debería aparecer -- y si
 * aparece, se dice, porque es dinero que el informe de propinas tampoco sabe
 * dónde poner.
 */
function salesHint(
  taken: ServiceSnapshot["taken"],
  t: (key: "salesSplit" | "salesSplitUnclassified") => string,
): string | undefined {
  const by = taken.byChannel;
  if (!by) return undefined;
  const money = (v: string) => formatMoney(v, "VES");
  return BigInt(by.unclassified.paymentsVes) > 0n
    ? t("salesSplitUnclassified")
        .replace("{app}", money(by.app.paymentsVes))
        .replace("{till}", money(by.till.paymentsVes))
        .replace("{rest}", money(by.unclassified.paymentsVes))
    : t("salesSplit")
        .replace("{app}", money(by.app.paymentsVes))
        .replace("{till}", money(by.till.paymentsVes));
}

function relativeAge(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
