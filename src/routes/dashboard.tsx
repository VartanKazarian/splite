import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

import { ConfigurationCard } from "@/components/panel/ConfigurationCard";
import { PanelIntro } from "@/components/panel/PanelIntro";
import { PendingCollection } from "@/components/panel/PendingCollection";
import { MetricCard } from "@/components/panel/MetricCard";
import { TableRow } from "@/components/panel/TableRow";
import { AGE_ATTENTION_MINUTES, toneOf } from "@/components/panel/tableStatus";
import { FloorFilters, matchesFilter, type FloorFilter } from "@/components/panel/FloorFilters";
import { TableDetailSheet } from "@/components/panel/TableDetailSheet";
import { AttentionList } from "@/components/panel/AttentionList";
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

  const [floorFilter, setFloorFilter] = useState<FloorFilter>("ALL");

  const tableList = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);
  const visibleTables = useMemo(
    () => tableList.filter((tb) => matchesFilter(tb, floorFilter)),
    [tableList, floorFilter],
  );
  const busyCount = tableList.filter((tb) => tb.openBill).length;

  // Si se resuelve el último aviso mientras está puesto el filtro de alertas,
  // la ficha desaparece y la lista se queda vacía sin decir por qué. Vuelve a
  // "todas", que es de donde salió.
  useEffect(() => {
    if (floorFilter === "ALERT" && !tableList.some((tb) => toneOf(tb) === "attention")) {
      setFloorFilter("ALL");
    }
  }, [floorFilter, tableList]);

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

  // La mesa por la que se empieza: la que lleva más tiempo con la cuenta
  // abierta. El resumen del servidor trae la fecha pero no de qué mesa es, y
  // el plano ya está aquí -- así que se busca aquí y no se pide otra vez.
  const oldestOpen = tableList
    .filter((tb) => tb.openBill)
    .sort((a, b) => (a.openBill!.openMinutes ?? 0) - (b.openBill!.openMinutes ?? 0))
    .at(-1);

  // Tres cosas que esperan a una persona: dinero declarado sin verificar,
  // cargos que el banco dejó en duda, y pedidos que la sala no ha mirado.
  const alerts =
    (snap?.claims.pending ?? pendingCount) +
    (snap ? snap.unresolvedC2P.inDoubt + snap.unresolvedC2P.ambiguous : unresolvedCount) +
    newOrders;

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
              onOldest={oldestOpen ? () => setSelectedId(oldestOpen.id) : undefined}
              onFree={() => setFloorFilter("FREE")}
            />

            {/* Tres cifras de contexto. "C2P sin resolver: 0" era una casilla
                permanente para un cero: ahora los avisos y los C2P sin
                resolver se suman en una sola, y sin nada pendiente dice que
                está todo al día en vez de subrayar el cero. */}
            {/* Las tres filas -- rótulo, cifra, apostilla -- se definen aquí y
                no dentro de cada tarjeta: así una cifra no se hunde porque su
                rótulo ocupe dos líneas. Ver `MetricCard`. */}
            <div className="grid gap-3 sm:grid-cols-3 sm:grid-rows-[auto_auto_auto]">
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
              {/* Con avisos, la tarjeta lleva a la cola donde se atienden.
                  Decía cuántos había y dejaba buscar la pantalla a mano. */}
              <MetricCard
                label={t("kpiAlerts")}
                value={alerts > 0 ? String(alerts) : "✓"}
                hint={alerts > 0 ? t("payStateVerify") : t("allClear")}
                tone={alerts > 0 ? "attention" : "neutral"}
                to={alerts > 0 ? "/pagos" : undefined}
                loading={snapshot.isLoading && !snap}
              />
            </div>

            {/* La antigüedad de la cuenta más vieja iba dentro de una frase
                larga junto a los cobros del día; aquí es su propio dato, que
                es como se lee de un vistazo. */}
            {/* La fila entera, y no sólo su texto: enseñaba el problema y no
                llevaba a él. En ámbar a partir del mismo umbral con el que se
                pinta la mesa en la lista, para que no digan dos cosas. */}
            {snap?.openBills.oldestOpenedAt && (
              <button
                type="button"
                disabled={!oldestOpen}
                onClick={() => oldestOpen && setSelectedId(oldestOpen.id)}
                className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none"
              >
                <span>{t("oldestBillLabel")}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`figure ${
                      (oldestOpen?.openBill?.openMinutes ?? 0) >= AGE_ATTENTION_MINUTES
                        ? "text-amber-700"
                        : ""
                    }`}
                  >
                    {relativeAge(snap.openBills.oldestOpenedAt)}
                  </span>
                  {oldestOpen && (
                    <>
                      <span className="text-primary">{t("goToBill")}</span>
                      <ArrowRight aria-hidden className="h-3.5 w-3.5 text-primary" />
                    </>
                  )}
                </span>
              </button>
            )}

            {/* Encima de las mesas: es lo que acaba de pasar, y lo de abajo es
                el estado. Desaparece sola cuando no hay nada. */}
            <OrderTray onOpenTable={(tableId) => setSelectedId(tableId)} />

            <section aria-labelledby="live-tables-heading">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                <h2 id="live-tables-heading" className="text-lg">
                  {t("liveTables")}
                </h2>
                <FloorFilters value={floorFilter} onChange={setFloorFilter} tables={tableList} />
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

          {/* Lo que no es del turno: avisos y el QR de la mesa elegida. Dar de
              alta la sala se hacía también aquí, plegado al final; ahora hay
              una sección de Mesas y tenerlo en dos sitios sólo servía para que
              se desviaran. */}
          <div className="min-w-0 space-y-6">
            <AttentionList
              tables={tableList}
              unresolvedC2P={
                snap ? snap.unresolvedC2P.inDoubt + snap.unresolvedC2P.ambiguous : unresolvedCount
              }
              openedAtByBill={openedAtByBill}
            />
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
