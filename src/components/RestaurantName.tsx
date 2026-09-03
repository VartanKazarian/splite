import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, account, type Account } from "@/lib/api";

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

  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });

  // El servidor manda mientras no se esté escribiendo: el campo se siembra con
  // lo guardado y a partir de ahí lo lleva el usuario.
  useEffect(() => {
    if (accountQuery.data) setName(accountQuery.data.name ?? "");
  }, [accountQuery.data]);

  const save = useMutation({
    mutationFn: () => account.rename(name.trim()),
    onSuccess: (data: Account) => {
      queryClient.setQueryData(["account"], data);
      toast.success(t("restaurantNameSaved"));
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
      else toast.error(t("apiDown"));
    },
  });

  const saved = accountQuery.data?.name ?? "";
  const trimmed = name.trim();
  // Nada que guardar si no ha cambiado o si se ha quedado vacío: el backend
  // rechaza el vacío, y pedirlo para que lo rechace es hacerle perder el viaje.
  const dirty = trimmed.length > 0 && trimmed !== saved;

  return (
    <section className="surface mt-6 p-6">
      <h2 className="text-xl">{t("restaurantName")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("restaurantNameHint")}</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          maxLength={120}
          disabled={!canEdit || accountQuery.isLoading}
          onChange={(e) => setName(e.target.value)}
          placeholder="Casa 72"
          className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring disabled:opacity-50"
        />
        <button
          disabled={!canEdit || !dirty || save.isPending}
          onClick={() => save.mutate()}
          className="whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {t("save")}
        </button>
      </div>

      {/* Lo que va a ver la mesa, con el mismo texto que pinta la pantalla del
          QR. Enseñarlo aquí es lo que convierte un campo cualquiera en algo
          que se entiende sin explicación. */}
      <p className="mt-3 text-xs text-muted-foreground">
        {t("restaurantNamePreview").replace("{name}", trimmed || saved || "—")}
      </p>

      {!canEdit && <p className="mt-2 text-xs text-muted-foreground">{t("menuForbidden")}</p>}
    </section>
  );
}
