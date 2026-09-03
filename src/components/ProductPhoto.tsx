import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { API_BASE_URL, ApiError, menu, type Product } from "@/lib/api";

/** Lo que acepta el backend, y el tope que aplica antes de subir nada. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * La foto de un plato.
 *
 * Opcional siempre: una carta sin fotos tiene que verse deliberada, no a medio
 * hacer, porque casi todas empiezan así y algunas se quedan así.
 *
 * El tamaño y el tipo se comprueban aquí *antes* de subir. No sustituye a la
 * comprobación del servidor -- esa es la que manda -- pero evita que alguien
 * suba dos megas por una red mala para que se los rechacen al final, que es
 * justo el momento en que se abandona.
 */
export function ProductPhoto({ product }: { product: Product }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["menu-products"] });
    queryClient.invalidateQueries({ queryKey: ["public-menu"] });
  };

  const fail = (error: unknown) => {
    if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
    else toast.error(t("apiDown"));
  };

  const upload = useMutation({
    mutationFn: (file: File) => menu.uploadProductImage(product.id, file),
    onSuccess: () => {
      setPreview(null);
      toast.success(t("productPhotoSaved"));
      refresh();
    },
    onError: (error) => {
      setPreview(null);
      fail(error);
    },
  });

  const remove = useMutation({
    mutationFn: () => menu.deleteProductImage(product.id),
    onSuccess: () => {
      toast.success(t("productPhotoRemoved"));
      refresh();
    },
    onError: fail,
  });

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error(t("productPhotoWrongType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("productPhotoTooBig"));
      return;
    }
    // Se enseña la foto elegida mientras sube. Sin esto la casilla se queda con
    // la anterior y parece que no ha pasado nada durante varios segundos.
    setPreview(URL.createObjectURL(file));
    upload.mutate(file);
  };

  const busy = upload.isPending || remove.isPending;
  const shown = preview ?? (product.imageUrl ? `${API_BASE_URL}${product.imageUrl}` : null);

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
        {shown ? (
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            // Se limpia para que elegir el mismo archivo otra vez vuelva a
            // disparar el change: sin esto, reintentar no hace nada.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {product.imageUrl ? t("productPhotoReplace") : t("productPhotoAdd")}
        </button>
        {product.imageUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove.mutate()}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-destructive disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("productPhotoRemove")}
          </button>
        )}
      </div>
    </div>
  );
}
