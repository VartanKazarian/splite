import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, ScanText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  formatMinor,
  menu,
  parseMinorInput,
  type MenuOcrDraft,
} from "@/lib/api";

type Row = {
  name: string;
  price: string;
  /**
   * El precio tal como está impreso, sin interpretar. No se edita: es la
   * referencia contra la que se revisa el campo de arriba. Sin él, comprobar
   * un precio significa volver a la foto.
   */
  priceText: string | null;
  section: string;
  description: string;
  duplicate: boolean;
};

function rowsFromDraft(draft: MenuOcrDraft): Row[] {
  return (draft.items ?? []).map((i) => ({
    name: i.name ?? "",
    price: i.priceMinorUnits ? formatMinor(i.priceMinorUnits) : "",
    priceText: i.priceText ?? null,
    section: i.section ?? "",
    description: i.description ?? "",
    duplicate: Boolean(i.duplicateName),
  }));
}

/** Sube una foto o PDF del menú, revisa el borrador y confirma la importación. */
export function MenuOcrImport({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const extract = useMutation({
    mutationFn: (file: File) => menu.ocrExtract(file),
    onSuccess: (draft) => {
      setRows(rowsFromDraft(draft));
      setNotes(draft.notes ?? null);
      if (!draft.items?.length) toast.error("No se pudo leer ningún producto de la imagen.");
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        toast.error("No se pudo contactar con el servidor.");
        return;
      }
      if (error.code === "MENU_OCR_NOT_CONFIGURED") {
        toast.error("La lectura automática de menús no está disponible en este servidor.");
        return;
      }
      toast.error(`${error.code} · ${error.message}`);
    },
  });

  const importRows = useMutation({
    mutationFn: (list: Row[]) =>
      menu.ocrImport(
        list.map((r) => ({
          name: r.name.trim(),
          priceMinorUnits: parseMinorInput(r.price),
          ...(r.description.trim() ? { description: r.description.trim() } : {}),
          ...(r.section.trim() ? { section: r.section.trim() } : {}),
        })),
      ),
    onSuccess: (result) => {
      const failed = result.errors?.length ?? 0;
      toast.success(
        `${result.importedCount ?? 0} productos importados${failed ? ` · ${failed} rechazados` : ""}`,
      );
      setRows(null);
      setNotes(null);
      onImported();
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        toast.error("No se pudo contactar con el servidor.");
        return;
      }
      toast.error(`${error.code} · ${error.message}`);
    },
  });

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev?.map((r, i) => (i === index ? { ...r, ...patch } : r)) ?? prev);

  const incomplete = (rows ?? []).some((r) => !r.name.trim() || !r.price.trim());
  const missingPrice = (rows ?? []).filter((r) => !r.price.trim()).length;
  const duplicates = (rows ?? []).filter((r) => r.duplicate).length;

  return (
    <section className="surface mt-6 p-6">
      <h2 className="flex items-center gap-2 text-xl">
        <ScanText className="h-5 w-5" /> Importar menú desde una foto
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sube una foto o PDF de tu carta. Revisa los precios leídos antes de importarlos.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) extract.mutate(file);
        }}
      />

      <button
        type="button"
        disabled={extract.isPending}
        onClick={() => fileRef.current?.click()}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm transition-colors hover:bg-secondary disabled:opacity-40 sm:w-auto"
      >
        {extract.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {extract.isPending ? "Leyendo la carta…" : "Subir foto o PDF"}
      </button>

      {notes && <p className="mt-3 text-xs text-muted-foreground">{notes}</p>}

      {rows && (
        <div className="mt-5">
          <p className="text-sm">
            {rows.length} productos leídos
            {missingPrice > 0 && ` · ${missingPrice} sin precio`}
            {duplicates > 0 && ` · ${duplicates} con nombre repetido`}
          </p>
          {/*
            El paso de revisión es la función, no un trámite previo. Un precio
            mal leído se le cobra a cada comensal que pida ese plato hasta que
            alguien lo note, así que la pantalla dice por qué merece la pena
            mirar en lugar de dar por hecho que se mirará.
          */}
          <p className="mt-1 text-xs text-muted-foreground">
            Compara cada precio con el de la carta antes de importar.
          </p>

          <ul className="mt-4 space-y-3 text-sm">
            {rows.map((r, i) => (
              <li key={i} className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[1.2fr_0.6fr_auto]">
                <input
                  value={r.name}
                  maxLength={160}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                  placeholder="Nombre"
                  className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
                />
                <div className="flex flex-col gap-1">
                  <input
                    value={r.price}
                    inputMode="decimal"
                    onChange={(e) => setRow(i, { price: e.target.value })}
                    placeholder="0,00"
                    className={`rounded-lg border bg-secondary px-3 py-2 text-sm outline-none focus:border-ring ${
                      r.price.trim() ? "border-input" : "border-destructive"
                    }`}
                  />
                  {/*
                    Lo impreso, junto a lo interpretado. Es la única forma de
                    revisar un precio sin volver a la foto -- y la diferencia
                    entre las dos cifras es exactamente lo que hay que mirar.
                  */}
                  {r.priceText ? (
                    <span className="text-[11px] text-muted-foreground">En la carta: {r.priceText}</span>
                  ) : (
                    !r.price.trim() && (
                      <span className="text-[11px] text-destructive">Sin precio legible en la foto</span>
                    )
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Quitar"
                  onClick={() => setRows((prev) => prev?.filter((_, x) => x !== i) ?? prev)}
                  className="justify-self-start rounded-full border border-border p-2 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <input
                  value={r.section}
                  maxLength={80}
                  onChange={(e) => setRow(i, { section: e.target.value })}
                  placeholder="Sección"
                  className="rounded-lg border border-input bg-secondary px-3 py-2 text-xs outline-none focus:border-ring"
                />
                <input
                  value={r.description}
                  maxLength={500}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                  placeholder="Descripción (opcional)"
                  className="rounded-lg border border-input bg-secondary px-3 py-2 text-xs outline-none focus:border-ring sm:col-span-2"
                />
                {r.duplicate && (
                  <p className="text-[11px] text-destructive sm:col-span-3">
                    Nombre repetido: renómbralo o quítalo antes de importar.
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!rows.length || incomplete || importRows.isPending}
              onClick={() => importRows.mutate(rows)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              Importar {rows.length} productos
            </button>
            <button
              type="button"
              onClick={() => {
                setRows(null);
                setNotes(null);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
