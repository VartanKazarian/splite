import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, account, type Account } from "@/lib/api";
import { isGoogleReviewUrl } from "@/lib/feedback";
import "@/lib/i18n-staff";

/**
 * El nombre del restaurante.
 *
 * No es una etiqueta interna: es lo primero que lee un comensal al escanear el
 * código de la mesa, encima del número de mesa. Hasta ahora sólo se fijaba una
 * vez, al registrarse, así que lo que se escribiera aquel día se quedaba
 * delante de cada cliente -- por eso una mesa en producción sigue diciendo
 * "Splite Demo".
 *
 * Sólo OWNER y MANAGER, igual que los datos de cobro: es el escaparate.
 */
export function RestaurantName({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [review, setReview] = useState("");

  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });

  // El servidor manda mientras no se esté escribiendo: el campo se siembra con
  // lo guardado y a partir de ahí lo lleva el usuario.
  useEffect(() => {
    if (!accountQuery.data) return;
    setName(accountQuery.data.name ?? "");
    setAddress(accountQuery.data.fiscalAddress ?? "");
    setReview(accountQuery.data.googleReviewUrl ?? "");
  }, [accountQuery.data]);

  const savedName = accountQuery.data?.name ?? "";
  const savedAddress = accountQuery.data?.fiscalAddress ?? "";
  const savedReview = accountQuery.data?.googleReviewUrl ?? "";

  const save = useMutation({
    // Sólo lo que cambió. Mandar los dos campos siempre es como se renombra un
    // restaurante sin querer al corregirle la dirección.
    mutationFn: () =>
      account.updateProfile({
        ...(name.trim() !== savedName ? { name: name.trim() } : {}),
        ...(address.trim() !== savedAddress ? { fiscalAddress: address.trim() } : {}),
        ...(review.trim() !== savedReview ? { googleReviewUrl: review.trim() } : {}),
      }),
    onSuccess: (data: Account) => {
      queryClient.setQueryData(["account"], data);
      // «Cambios guardados» y no «Nombre guardado»: el formulario guarda
      // también la dirección, y decir «nombre» al cambiar sólo la dirección
      // hacía dudar de si se había guardado.
      toast.success(t("saved"));
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
      else toast.error(t("apiDown"));
    },
  });

  const trimmed = name.trim();
  // El nombre no puede quedarse vacío -- el backend lo rechaza y una mesa sin
  // nombre no es una pantalla que se pueda enseñar. La dirección sí: vaciarla
  // es la forma de quitar una mal escrita.
  const nameOk = trimmed.length > 0;
  // El enlace de Google sólo si es de Google (lo mismo que exige el servidor);
  // vacío vale, que es como se quita.
  const reviewOk = review.trim() === "" || isGoogleReviewUrl(review.trim());
  const dirty =
    nameOk &&
    reviewOk &&
    (trimmed !== savedName || address.trim() !== savedAddress || review.trim() !== savedReview);

  return (
    <section className="surface mt-6 p-6">
      <h2 className="text-xl">{t("restaurantName")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("restaurantNameHint")}</p>

      {/* Cada campo con su rótulo. La dirección sólo tenía el ejemplo dentro,
          en gris, y un ejemplo con una dirección real parecía un dato ya
          guardado: no se sabía si estaba puesta o no. */}
      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor="restaurant-name" className="field-label">
          {t("name")}
        </label>
        <input
          id="restaurant-name"
          value={name}
          maxLength={120}
          disabled={!canEdit || accountQuery.isLoading}
          onChange={(e) => setName(e.target.value)}
          placeholder="Casa 72"
          className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring disabled:opacity-50"
        />
        {/*
          El domicilio encabeza el recibo del comensal. Va aquí, junto al
          nombre, porque es la misma decisión -- lo que el cliente lee de este
          local -- y el mismo endpoint. Sin este campo la columna existiría sin
          que nadie pudiera rellenarla, y el recibo saldría con el nombre
          suelto para siempre.
        */}
        <label htmlFor="restaurant-address" className="field-label mt-2">
          {t("restaurantAddress")}
        </label>
        <input
          id="restaurant-address"
          value={address}
          maxLength={200}
          disabled={!canEdit || accountQuery.isLoading}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t("restaurantAddressPlaceholder")}
          className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">{t("restaurantAddressHint")}</p>
        {/* R20: adónde se invita a dejar una reseña después de pagar. Va aquí
            porque es lo mismo -- lo que el cliente ve de este local -- y el
            mismo endpoint. */}
        <label htmlFor="restaurant-google-review" className="field-label mt-2">
          {t("googleReviewUrl")}
        </label>
        <input
          id="restaurant-google-review"
          type="url"
          inputMode="url"
          value={review}
          maxLength={500}
          disabled={!canEdit || accountQuery.isLoading}
          onChange={(e) => setReview(e.target.value)}
          placeholder="https://g.page/r/…/review"
          aria-invalid={!reviewOk}
          aria-describedby="restaurant-google-review-hint"
          className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring disabled:opacity-50 aria-[invalid=true]:border-destructive"
        />
        <p id="restaurant-google-review-hint" className="text-xs text-muted-foreground">
          {reviewOk ? t("googleReviewUrlHint") : t("googleReviewUrlInvalid")}
        </p>
        <button
          disabled={!canEdit || !dirty || save.isPending}
          onClick={() => save.mutate()}
          className="mt-1 self-start whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {t("save")}
        </button>
      </div>

      {/* Lo que va a ver la mesa, con el mismo texto que pinta la pantalla del
          QR. Enseñarlo aquí es lo que convierte un campo cualquiera en algo
          que se entiende sin explicación. */}
      <p className="mt-3 text-xs text-muted-foreground">
        {t("restaurantNamePreview").replace("{name}", trimmed || savedName || "—")}
      </p>

      {!canEdit && <p className="mt-2 text-xs text-muted-foreground">{t("menuForbidden")}</p>}
    </section>
  );
}
