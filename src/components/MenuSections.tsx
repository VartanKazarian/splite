import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ApiError, menu, type MenuCategory } from "@/lib/api";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useI18n } from "@/lib/i18n";

/**
 * Las secciones del menú, mantenidas a mano.
 *
 * Hasta ahora lo único que las creaba era una importación por OCR inventándolas
 * a partir de los títulos que leía en una foto: bien para la primera carta,
 * inútil después. Y la versión anterior de esta pantalla las guardaba en
 * `localStorage`, así que vivían en un solo navegador -- ni el resto del
 * personal ni, sobre todo, el comensal las veían nunca.
 *
 * Ahora son filas del servidor, que es lo que lee la carta pública.
 */
export function MenuSections({
  onChanged,
  legacy,
}: {
  /** Los productos cambian de sección detrás de esto: la lista debe recargarse. */
  onChanged: () => void;
  /** Categorías que quedaron en este navegador, si las hay. */
  legacy?: { names: string[]; onImported: () => void };
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const categories = useQuery({
    queryKey: ["menu-categories"],
    queryFn: () => menu.categories(),
    retry: false,
  });

  const rows = useMemo(() => categories.data?.data ?? [], [categories.data]);
  const loose = categories.data?.uncategorisedCount ?? 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
    onChanged();
  };

  const fail = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.code === "CATEGORY_NAME_TAKEN") return toast.error(t("sectionNameTaken"));
      if (error.code === "CATEGORY_NOT_FOUND") {
        refresh();
        return toast.error(t("sectionGone"));
      }
      return toast.error(`${error.code} · ${error.message}`);
    }
    return toast.error(t("apiUnreachable"));
  };

  const create = useMutation({
    mutationFn: (name: string) => menu.createCategory({ name }),
    onSuccess: () => {
      setNewName("");
      toast.success(t("sectionCreated"));
      refresh();
    },
    onError: fail,
  });

  const rename = useMutation({
    mutationFn: (p: { id: string; name: string }) => menu.updateCategory(p.id, { name: p.name }),
    onSuccess: () => {
      setEditingId(null);
      toast.success(t("sectionRenamed"));
      refresh();
    },
    onError: fail,
  });

  const toggle = useMutation({
    mutationFn: (p: { id: string; active: boolean }) =>
      menu.updateCategory(p.id, { active: p.active }),
    onSuccess: () => refresh(),
    onError: fail,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => menu.reorderCategories(ids),
    onSuccess: () => refresh(),
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => menu.deleteCategory(id),
    onSuccess: () => {
      toast.success(t("sectionDeleted"));
      refresh();
    },
    onError: fail,
  });

  /** Importa de una vez las categorías que quedaron sueltas en este navegador. */
  const importLegacy = useMutation({
    mutationFn: async (names: string[]) => {
      // Secuencial y no en paralelo: los nombres son únicos por restaurante, y
      // dos inserciones a la vez con el mismo nombre se pisarían.
      for (const name of names) {
        try {
          await menu.createCategory({ name });
        } catch (error) {
          // Una que ya exista no es un fallo de la importación.
          if (!(error instanceof ApiError && error.code === "CATEGORY_NAME_TAKEN")) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(t("sectionsImported"));
      legacy?.onImported();
      refresh();
    },
    onError: fail,
  });

  const move = (index: number, delta: number) => {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const moved = next[index];
    const other = next[target];
    if (!moved || !other) return;
    next[index] = other;
    next[target] = moved;
    reorder.mutate(next.map((c) => c.id));
  };

  const busy =
    create.isPending ||
    rename.isPending ||
    reorder.isPending ||
    remove.isPending ||
    toggle.isPending ||
    importLegacy.isPending;

  return (
    <section className="surface mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">Secciones de la carta</h2>
        <p className="text-xs text-muted-foreground">
          El orden de aquí es el orden que ve el comensal
        </p>
      </div>

      {legacy && legacy.names.length > 0 && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">
          <p>
            Hay {legacy.names.length} sección(es) guardada(s) sólo en este navegador:{" "}
            {legacy.names.join(", ")}. Antes no se enviaban al servidor, así que ni tu equipo ni los
            comensales las veían.
          </p>
          <button
            onClick={() => importLegacy.mutate(legacy.names)}
            disabled={busy}
            className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60"
          >
            {importLegacy.isPending ? t("importing") : t("importThem")}
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) create.mutate(newName.trim());
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("sectionPlaceholder")}
          maxLength={80}
          className="min-w-0 flex-1 rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Añadir sección
        </button>
      </form>

      {categories.isLoading && <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>}

      {!categories.isLoading && rows.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Todavía no hay secciones. Sin ellas la carta es una sola lista alfabética.
        </p>
      )}

      <ul className="mt-4 divide-y divide-border">
        {rows.map((c: MenuCategory, i: number) => (
          <li key={c.id} className="flex items-center gap-2 py-2.5">
            {/* El icono es pequeño, la zona pulsable no: esto se usa con el
                pulgar, y una diana de 14 px no se acierta. */}
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={busy || i === 0}
                aria-label={`Subir ${c.name}`}
                className="flex h-6 w-8 items-center justify-center text-muted-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={busy || i === rows.length - 1}
                aria-label={`Bajar ${c.name}`}
                className="flex h-6 w-8 items-center justify-center text-muted-foreground disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            {editingId === c.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingName.trim()) rename.mutate({ id: c.id, name: editingName.trim() });
                }}
                className="flex min-w-0 flex-1 gap-2"
              >
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  maxLength={80}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-input bg-secondary px-2 py-1 text-sm outline-none focus:border-ring"
                />
                <button type="submit" disabled={busy} aria-label="Guardar">
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setEditingId(null)} aria-label="Cancelar">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </form>
            ) : (
              <>
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${c.active ? "" : "text-muted-foreground line-through"}`}
                >
                  {c.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.productCount ?? 0}
                </span>
                <button
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingName(c.name);
                  }}
                  disabled={busy}
                  aria-label={`Renombrar ${c.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => toggle.mutate({ id: c.id, active: !c.active })}
                  disabled={busy}
                  aria-label={c.active ? `Ocultar ${c.name}` : `Mostrar ${c.name}`}
                  title={c.active ? t("sectionHide") : t("sectionShow")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
                >
                  {c.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                {/* Borrar la cabecera no borra la comida, y conviene decirlo
                    antes y no después. Con el `confirm()` del navegador el
                    aviso iba escrito a mano en español: el selector de idioma
                    no lo tocaba. */}
                <ConfirmButton
                  title={t("confirmDeleteSection")}
                  description={t("confirmDeleteSectionBody")}
                  confirmLabel={t("confirmDeleteSectionCta")}
                  onConfirm={() => remove.mutate(c.id)}
                  disabled={busy}
                  aria-label={`${t("deleteForever")} ${c.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
              </>
            )}
          </li>
        ))}
      </ul>

      {loose > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {loose} producto(s) sin sección. Aparecen al final de la carta, bajo «Otros».
        </p>
      )}
    </section>
  );
}
