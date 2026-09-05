import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { API_BASE_URL, ApiError, menu, type MenuDocument } from "@/lib/api";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useI18n } from "@/lib/i18n";

/** "394" -> "394 B", "2100000" -> "2,1 MB". Sólo para enseñar un tamaño. */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * La carta del restaurante, subida tal cual.
 *
 * No sustituye a los productos: una cuenta se arma con filas con precio, y nada
 * de lo que se suba aquí puede añadirse a una. Es para que un restaurante cuya
 * carta es un PDF pueda enseñar algo al comensal desde el primer día, antes de
 * que nadie haya tecleado un precio.
 */
export function MenuPdfCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const doc = useQuery({
    queryKey: ["menu-pdf"],
    retry: false,
    queryFn: async (): Promise<MenuDocument | null> => {
      try {
        return await menu.pdf();
      } catch (error) {
        // 404 es el estado normal de un restaurante que no ha subido ninguna.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["menu-pdf"] });

  const fail = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.code === "MENU_PDF_UNSUPPORTED_MEDIA") return toast.error(t("pdfOnlyPdf"));
      if (error.code === "MENU_PDF_FILE_TOO_LARGE") {
        const max = Number(error.details?.["maxBytes"] ?? 0);
        return toast.error(
          `El archivo es demasiado grande${max ? ` (máximo ${humanSize(max)})` : ""}`,
        );
      }
      return toast.error(`${error.code} · ${error.message}`);
    }
    return toast.error(t("apiUnreachable"));
  };

  const upload = useMutation({
    mutationFn: (file: File) => menu.uploadPdf(file),
    onSuccess: () => {
      toast.success(t("pdfUploaded"));
      refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => menu.deletePdf(),
    onSuccess: () => {
      toast.success(t("pdfDeleted"));
      refresh();
    },
    onError: fail,
  });

  const accept = (file: File | undefined) => {
    if (!file) return;
    // Se comprueba también en el servidor, por los bytes y no por la etiqueta.
    // Aquí es sólo para dar la respuesta antes de subir 20 MB en vano.
    if (file.type && file.type !== "application/pdf") {
      toast.error(t("pdfOnlyPdf"));
      return;
    }
    upload.mutate(file);
  };

  const current = doc.data ?? null;
  const busy = upload.isPending || remove.isPending;

  return (
    <section className="surface mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">Carta en PDF</h2>
        <p className="text-xs text-muted-foreground">Opcional · la ve quien escanea el QR</p>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Si ya tienes la carta diseñada, súbela y el comensal podrá leerla al escanear la mesa. No
        sustituye a los productos: la cuenta se sigue armando con los precios de arriba.
      </p>

      {doc.isLoading && <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>}

      {!doc.isLoading && current && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary p-3">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <a
              href={`${API_BASE_URL}${current.url}`}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm underline-offset-2 hover:underline"
            >
              {current.filename}
            </a>
            <p className="text-xs text-muted-foreground">
              {humanSize(current.sizeBytes)} · actualizada{" "}
              {new Date(current.updatedAt).toLocaleString("es-VE")}
            </p>
          </div>
          <ConfirmButton
            title={t("confirmDeletePdf")}
            description={t("confirmDeletePdfBody")}
            confirmLabel={t("confirmDeletePdfCta")}
            onConfirm={() => remove.mutate()}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("deleteForever")}
          </ConfirmButton>
        </div>
      )}

      {!doc.isLoading && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          className={`mt-4 rounded-lg border border-dashed p-6 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              accept(e.target.files?.[0]);
              // Permite volver a elegir el mismo archivo después de corregirlo.
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {upload.isPending ? t("pdfUploading") : current ? t("pdfReplace") : t("pdfUpload")}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            PDF, hasta 20 MB. También puedes arrastrarla aquí.
          </p>
        </div>
      )}
    </section>
  );
}
