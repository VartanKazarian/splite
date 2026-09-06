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
import { TableDetailSheet } from "@/components/panel/TableDetailSheet";
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

export const Route = createFileRoute("/mesas")({
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

  const [filter, setFilter] = useState<"ALL" | "BUSY" | "FREE">("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tableList
      .filter((tb) => (filter === "ALL" ? true : filter === "BUSY" ? !!tb.openBill : !tb.openBill))
      .filter((tb) => (needle ? tb.name.toLowerCase().includes(needle) : true));
  }, [tableList, filter, search]);

  const selected = tableList.find((tb) => tb.id === selectedId) ?? null;

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown"));

  const [createOpen, setCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const createTable = useMutation({
    mutationFn: () => tablesApi.create(newTableName.trim()),
    onSuccess: (table) => {
      setNewTableName("");
      setCreateOpen(false);
      setSelectedId(table.id);
      toast.success(t("tableCreated"));
      queryClient.invalidateQueries({ queryKey: ["floor"] });
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

          <div className="flex gap-1">
            {(
              [
                ["ALL", t("seeAll"), tableList.length],
                ["BUSY", t("tableOpenShort"), busyCount],
                ["FREE", t("tableFreeShort"), tableList.length - busyCount],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`min-h-11 whitespace-nowrap rounded-full px-3 text-xs transition-colors ${
                  filter === value
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
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
                <TableRow
                  key={tb.id}
                  table={tb}
                  selected={selected?.id === tb.id}
                  onSelect={() => setSelectedId(selected?.id === tb.id ? null : tb.id)}
                  fallbackOpenedAt={tb.openBill ? openedAtByBill.get(tb.openBill.id) : undefined}
                />
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
