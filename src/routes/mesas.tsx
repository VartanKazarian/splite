import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PanelHeader } from "@/components/PanelHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { LoadFailed } from "@/components/shell/LoadFailed";
import { TableRow } from "@/components/panel/TableRow";
import { SwipeRow } from "@/components/panel/SwipeRow";
import { TableDetailSheet } from "@/components/panel/TableDetailSheet";
import { FloorFilters, matchesFilter, type FloorFilter } from "@/components/panel/FloorFilters";
import { toneOf } from "@/components/panel/tableStatus";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { ApiError, bills, staffSession, tables as tablesApi } from "@/lib/api";

type Search = { filtro?: FloorFilter };

const FILTERS: FloorFilter[] = ["ALL", "BUSY", "FREE", "ALERT"];

function isFilter(value: unknown): value is FloorFilter {
  return typeof value === "string" && FILTERS.includes(value as FloorFilter);
}

export const Route = createFileRoute("/mesas")({
  /*
   * Con qué filtro abrir la sala.
   *
   * Existe porque el panel manda aquí desde sus avisos, y un aviso que dice
   * "3 cuentas llevan más de 12 h abiertas" tiene que llegar a esas tres y no
   * a las siete. Sin esto, el destino era la lista entera y había que volver a
   * filtrar a mano justo después de que el panel dijera cuáles eran.
   *
   * Un valor que no reconocemos se ignora en vez de romper la pantalla: la URL
   * la escribe cualquiera.
   */
  validateSearch: (search: Record<string, unknown>): Search =>
    isFilter(search["filtro"]) ? { filtro: search["filtro"] } : {},
  head: () => ({
    meta: [
      { title: "Mesas — Splite" },
      {
        name: "description",
        content:
          "Gestiona las mesas de tu restaurante: estado, cuentas abiertas, cobros y códigos QR.",
      },
    ],
  }),
  component: Mesas,
});

/**
 * La sala, entera y para trabajarla.
 *
 * El panel es un resumen: dice cuánto se debe y qué mesa hay que mirar. Aquí se
 * hace el trabajo -- montar la sala, buscar una mesa por nombre, abrir su
 * cuenta, cobrar, imprimir su código. Hasta ahora todo eso vivía apretado en un
 * lado del panel, y era la razón por la que el panel no podía ser un resumen.
 *
 * El detalle, el cobro y el QR son los mismos componentes que usa el panel. No
 * hay una segunda forma de cobrar ni una segunda forma de cerrar una cuenta.
 */
function Mesas() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // `search` ya es el texto del buscador en esta pantalla.
  const { filtro: filterFromUrl } = Route.useSearch();

  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!staffSession.get()) navigate({ to: "/login" });
    else setReady(true);
  }, [navigate]);

  // La misma clave que el panel: entrar aquí desde allí no vuelve a pedir la sala.
  const tablesQuery = useQuery({
    queryKey: ["floor"],
    queryFn: () => tablesApi.floor(),
    enabled: ready,
    retry: false,
    refetchInterval: 8000,
  });

  // La antigüedad de respaldo, para respuestas que aún no traen `openMinutes`.
  const openBillsQuery = useQuery({
    queryKey: ["bills", "OPEN"],
    queryFn: () => bills.list("OPEN"),
    enabled: ready,
    retry: false,
    refetchInterval: 30000,
  });
  const openedAtByBill = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of openBillsQuery.data ?? []) if (b.createdAt) map.set(b.id, b.createdAt);
    return map;
  }, [openBillsQuery.data]);

  const tableList = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);
  const busyCount = tableList.filter((tb) => tb.openBill).length;

  // El filtro con el que se entra manda sólo al entrar: a partir de ahí las
  // fichas son las que mandan, y una `key` en la URL que volviera a imponerse
  // dejaría la pantalla sin poder cambiar de filtro.
  const [filter, setFilter] = useState<FloorFilter>(
    isFilter(filterFromUrl) ? filterFromUrl : "ALL",
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Si se resuelve el último aviso mientras está puesto el filtro de alertas,
  // la ficha desaparece y la lista se queda vacía sin decir por qué. Vuelve a
  // "todas", que es de donde salió.
  useEffect(() => {
    if (!tablesQuery.isSuccess) return;
    if (filter === "ALERT" && !tableList.some((tb) => toneOf(tb) === "attention")) {
      setFilter("ALL");
    }
  }, [filter, tableList, tablesQuery.isSuccess]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tableList
      .filter((tb) => matchesFilter(tb, filter))
      .filter((tb) => (needle ? tb.name.toLowerCase().includes(needle) : true));
  }, [tableList, filter, search]);

  const selected = tableList.find((tb) => tb.id === selectedId) ?? null;

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown"));

  const [createOpen, setCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const createTable = useMutation({
    mutationFn: () => tablesApi.create(newTableName.trim()),
    // Crear una mesa y nada más. Abría su hoja encima, y lo primero que ofrece
    // esa hoja es "Abrir cuenta": quien está dando de alta el comedor tenía que
    // cerrarla ocho veces para seguir creando mesas. Dar de alta una mesa y
    // sentar gente en ella son dos gestos, y casi nunca el mismo día.
    onSuccess: () => {
      setNewTableName("");
      setCreateOpen(false);
      toast.success(t("tableCreated"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      queryClient.invalidateQueries({ queryKey: ["service-snapshot"] });
    },
    onError: fail,
  });

  /**
   * Borrar una mesa deslizándola, sin entrar en ella.
   *
   * `swipedId` vive aquí y no en cada fila para que sólo una pueda estar
   * abierta: dos botones rojos a la vez es un dedo bajando por encima de los
   * dos. Y se cierra sola en cuanto la lista cambia -- otro filtro, otra
   * búsqueda, la mesa borrada --, porque una fila desplazada sobre una lista
   * que ya no es la misma deja el botón encima de otra mesa.
   */
  const [swipedId, setSwipedId] = useState<string | null>(null);
  // Al cambiar lo que se está mirando: la fila desplazada quedaría sobre otra
  // mesa.
  useEffect(() => setSwipedId(null), [filter, search]);
  // Y si esa mesa desaparece de la lista -- se borró, o dejó de encajar en el
  // filtro --, el botón se queda sin dueño.
  //
  // Esto no puede depender de la identidad de `tableList`: el plano se vuelve a
  // pedir cada ocho segundos y React Query devuelve un array nuevo cada vez, así
  // que la fila se cerraba sola a los pocos segundos de abrirla. Medido.
  useEffect(() => {
    if (swipedId && !tableList.some((tb) => tb.id === swipedId)) setSwipedId(null);
  }, [tableList, swipedId]);
  const removeTable = useMutation({
    mutationFn: (tableId: string) => tablesApi.deactivate(tableId),
    onSuccess: () => {
      setSwipedId(null);
      toast.success(t("tableDeleted"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      queryClient.invalidateQueries({ queryKey: ["service-snapshot"] });
    },
    onError: fail,
  });

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("10");
  const bulkNumber = Number(bulkCount);
  const bulkValid = Number.isInteger(bulkNumber) && bulkNumber >= 1 && bulkNumber <= 200;
  const createTablesBulk = useMutation({
    mutationFn: () => tablesApi.createMany(bulkNumber),
    onSuccess: (r) => {
      setBulkOpen(false);
      toast.success(
        r.alreadyExisted > 0
          ? `${r.created} · ${r.alreadyExisted}`
          : `${r.created} ${t("tablesNav").toLowerCase()}`,
      );
      queryClient.invalidateQueries({ queryKey: ["floor"] });
      queryClient.invalidateQueries({ queryKey: ["service-snapshot"] });
    },
    onError: fail,
  });

  if (!ready) return null;

  return (
    <div className="min-h-screen">
      <PanelHeader current="mesas" />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <PageHeader
          title={t("tablesNav")}
          meta={
            tablesQuery.isSuccess
              ? t("tablesMeta")
                  .replace("{total}", String(tableList.length))
                  .replace("{busy}", String(busyCount))
              : undefined
          }
          actions={
            <>
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> {t("createTable")}
              </button>
              <button
                onClick={() => setBulkOpen(true)}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-border px-5 text-sm transition-colors hover:bg-secondary"
              >
                {t("bulkCreate")}
              </button>
            </>
          }
        />

        {tablesQuery.isError && (
          <div className="mt-4">
            <LoadFailed onRetry={() => void tablesQuery.refetch()} />
          </div>
        )}

        {/* En el móvil la búsqueda se lleva la fila entera y los filtros caen
            debajo: compartiendo línea con tres fichas, el campo quedaba en
            "Busca" y no se leía ni el marcador de posición. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchTable")}
              aria-label={t("searchTable")}
              className="min-h-11 w-full rounded-full border border-input bg-secondary pl-9 pr-4 text-sm outline-none focus:border-ring"
            />
          </div>

          <FloorFilters value={filter} onChange={setFilter} tables={tableList} />
        </div>

        <div className="mt-4">
          {tablesQuery.isLoading ? (
            <div className="surface divide-y divide-border">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-5 w-40" />
                </div>
              ))}
            </div>
          ) : tableList.length === 0 ? (
            <div className="surface">
              <EmptyState
                title={t("noTablesYet")}
                hint={t("noTablesYetHint")}
                action={
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                  >
                    <Plus className="h-4 w-4" /> {t("createTable")}
                  </button>
                }
              />
            </div>
          ) : (
            <div className="surface divide-y divide-border overflow-hidden">
              {visible.map((tb) => (
                /* Sólo las libres se pueden borrar, que es la regla que ya
                   aplicaba el menú de la hoja: una mesa con cuenta abierta no
                   se mueve y no descubre nada. Ver `SwipeRow`. */
                <SwipeRow
                  key={tb.id}
                  label={tb.name}
                  disabled={Boolean(tb.openBill)}
                  pending={removeTable.isPending}
                  open={swipedId === tb.id}
                  onOpenChange={(isOpen) => setSwipedId(isOpen ? tb.id : null)}
                  onDelete={() => removeTable.mutate(tb.id)}
                >
                  <TableRow
                    table={tb}
                    selected={selected?.id === tb.id}
                    // Con el botón de borrar asomado, el toque siguiente lo
                    // guarda: es lo que espera quien se asomó y se arrepiente,
                    // y abrir la mesa encima del botón rojo sería lo contrario.
                    onSelect={() => {
                      if (swipedId === tb.id) return setSwipedId(null);
                      setSelectedId(selected?.id === tb.id ? null : tb.id);
                    }}
                    fallbackOpenedAt={tb.openBill ? openedAtByBill.get(tb.openBill.id) : undefined}
                  />
                </SwipeRow>
              ))}
              {visible.length === 0 && <EmptyState title={t("noTablesMatch")} />}
            </div>
          )}
        </div>
      </main>

      {/* El detalle, encima de la lista. Abriéndose dentro de ella empezaba en
          y=857 de una página de 1.797 en un teléfono: por debajo del pliegue y
          detrás de todo lo que ya habías pasado. Ver `TableDetailSheet`. */}
      <TableDetailSheet
        table={selected}
        open={Boolean(selected)}
        onOpenChange={(v) => !v && setSelectedId(null)}
        onDeleted={() => setSelectedId(null)}
      />

      {/* Crear una mesa */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createTableTitle")}</DialogTitle>
          </DialogHeader>
          <div className="px-1">
            <label htmlFor="new-table" className="block text-xs text-muted-foreground">
              {t("tableName")}
            </label>
            <input
              id="new-table"
              autoFocus
              value={newTableName}
              maxLength={50}
              onChange={(e) => setNewTableName(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
            />
            <button
              disabled={!newTableName.trim() || createTable.isPending}
              onClick={() => createTable.mutate()}
              className="mt-4 min-h-12 w-full rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {createTable.isPending ? t("creating") : t("createTable")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crear varias. La vista previa dice exactamente qué nombres saldrán,
          que es lo que nadie sabía antes de pulsar. */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulkTitle")}</DialogTitle>
            <DialogDescription>{t("bulkExisting")}</DialogDescription>
          </DialogHeader>
          <div className="px-1">
            <label htmlFor="bulk-count" className="block text-xs text-muted-foreground">
              {t("bulkHowMany")}
            </label>
            <input
              id="bulk-count"
              type="number"
              min={1}
              max={200}
              value={bulkCount}
              onChange={(e) => setBulkCount(e.target.value)}
              className="mt-2 min-h-11 w-28 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
            />

            {bulkValid && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">{t("bulkPreview")}</p>
                <p className="mt-1 text-sm">
                  {/* Los nombres los pone el servidor con el prefijo "Mesa";
                      esto sólo enseña los que van a salir. */}
                  {Array.from({ length: Math.min(bulkNumber, 6) }, (_, i) => `Mesa ${i + 1}`).join(
                    ", ",
                  )}
                  {bulkNumber > 6 ? `, … Mesa ${bulkNumber}` : ""}
                </p>
              </div>
            )}

            <button
              disabled={!bulkValid || createTablesBulk.isPending}
              onClick={() => createTablesBulk.mutate()}
              className="mt-4 min-h-12 w-full rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {createTablesBulk.isPending ? t("creating") : t("create")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
