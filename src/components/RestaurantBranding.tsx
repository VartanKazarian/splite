import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ConfirmButton } from "@/components/ConfirmButton";
import { API_BASE_URL, ApiError, menu, type BrandingKind, type PublicMenu } from "@/lib/api";

/** Lo que acepta el backend, y el tope que aplica antes de subir nada. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * La portada y el logo del restaurante.
 *
 * Es lo primero que ve alguien que acaba de escanear el código de la mesa, y lo
 * que le dice que está en el sitio correcto antes de leer nada. Las dos son
 * opcionales: una carta sin portada tiene que verse deliberada.
 *
 * Se leen del menú público -- el mismo endpoint que consulta el móvil del
 * comensal -- en vez de tener un endpoint propio de lectura. Así el panel
 * enseña exactamente lo que va a ver la mesa, y no su propia idea de ello.
 */
export function RestaurantBranding({
  restaurantId,
  canEdit,
}: {
  restaurantId: string | undefined;
  canEdit: boolean;
}) {
  const { t } = useI18n();

  const branding = useQuery({
    queryKey: ["public-menu", restaurantId],
    enabled: Boolean(restaurantId),
    retry: false,
    queryFn: () => menu.publicMenu(restaurantId!),
  });

  const data = branding.data as PublicMenu | undefined;

  return (
    <section className="surface mt-6 p-6">
      <h2 className="text-xl">{t("branding")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("brandingHint")}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1.6fr_1fr]">
        <Slot
          kind="COVER"
          label={t("brandingCover")}
          hint={t("brandingCoverHint")}
          url={data?.restaurant.coverUrl ?? null}
          canEdit={canEdit}
          restaurantId={restaurantId}
          className="aspect-[16/9]"
        />
        <Slot
          kind="LOGO"
          label={t("brandingLogo")}
          hint={t("brandingLogoHint")}
          url={data?.restaurant.logoUrl ?? null}
          canEdit={canEdit}
          restaurantId={restaurantId}
          className="aspect-square"
        />
      </div>

      {!canEdit && <p className="mt-3 text-xs text-muted-foreground">{t("menuForbidden")}</p>}
    </section>
  );
}

function Slot({
  kind,
  label,
  hint,
  url,
  canEdit,
  restaurantId,
  className,
}: {
  kind: BrandingKind;
  label: string;
  hint: string;
  url: string | null;
  canEdit: boolean;
  restaurantId: string | undefined;
  className: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["public-menu", restaurantId] });

  const fail = (error: unknown) => {
    if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
    else toast.error(t("apiDown"));
  };

  const upload = useMutation({
    mutationFn: (file: File) => menu.uploadBranding(kind, file),
    onSuccess: () => {
      setPreview(null);
      toast.success(t("brandingSaved"));
      refresh();
    },
    onError: (error) => {
      setPreview(null);
      fail(error);
    },
  });

  const remove = useMutation({
    mutationFn: () => menu.deleteBranding(kind),
    onSuccess: () => {
      toast.success(t("brandingRemoved"));
      refresh();
    },
    onError: fail,
  });

  // Se comprueban tipo y tamaño antes de mandar nada. El servidor los comprueba
  // también y su respuesta es la que manda, pero rechazar cuatro megas después
  // de subirlos por una red mala es justo cuando se abandona.
  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error(t("productPhotoWrongType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("brandingTooBig"));
      return;
    }
    setPreview(URL.createObjectURL(file));
    upload.mutate(file);
  };

  const busy = upload.isPending || remove.isPending;
  const shown = preview ?? (url ? `${API_BASE_URL}${url}` : null);

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <div
        className={`relative mt-2 w-full overflow-hidden rounded-xl border border-border bg-secondary ${className}`}
      >
        {shown ? (
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>

      <div className="mt-2 flex flex-wrap gap-2">
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
          disabled={!canEdit || busy}
          onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-2 min-h-11 rounded-full border border-border px-4 text-xs disabled:opacity-40"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {url ? t("productPhotoReplace") : t("productPhotoAdd")}
        </button>
        {url && (
          <ConfirmButton
            title={t("confirmDeleteBranding")}
            description={t("confirmDeleteBrandingBody")}
            confirmLabel={t("confirmDeleteBrandingCta")}
            onConfirm={() => remove.mutate()}
            disabled={!canEdit || busy}
            className="inline-flex items-center gap-2 min-h-11 rounded-full border border-border px-4 text-xs text-destructive disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("productPhotoRemove")}
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
