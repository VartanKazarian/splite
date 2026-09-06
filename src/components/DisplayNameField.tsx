import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth } from "@/lib/api";

/**
 * Cómo quiere que le llamen quien está mirando.
 *
 * El panel saluda al abrir el turno, y hasta ahora el único nombre disponible
 * era la parte del correo anterior a la arroba: "gerencia@casa72.com" saludaba
 * a "Gerencia". Con esto se puede decir el de verdad.
 *
 * Es de la persona, no del restaurante, así que vive en el grupo de cuenta
 * junto a la contraseña y el segundo factor -- y como aquéllos, sin gate de rol:
 * un mesero también tiene nombre.
 *
 * Vaciar la casilla y guardar borra el nombre. El servidor lo trata igual, así
 * que no hace falta un botón aparte para quitarlo.
 */
export function DisplayNameField() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });
  const saved = me.data?.user.displayName ?? "";

  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  // Se rellena cuando llega la consulta, y no se vuelve a pisar en cuanto
  // alguien ha escrito: sin esto, un refetch de fondo borraría lo tecleado.
  useEffect(() => {
    if (!touched) setValue(saved);
  }, [saved, touched]);

  const save = useMutation({
    mutationFn: () => auth.setDisplayName(value.trim()),
    onSuccess: (result) => {
      setTouched(false);
      // La respuesta trae el usuario entero, así que se siembra la caché en vez
      // de pedir /me otra vez.
      queryClient.setQueryData(["me"], result);
      toast.success(t("saved"));
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? t("displayNameFailed") : t("apiDown")),
  });

  const dirty = value.trim() !== saved;

  return (
    <div>
      <label
        htmlFor="display-name"
        className="block text-xs uppercase tracking-widest text-muted-foreground"
      >
        {t("displayName")}
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{t("displayNameHint")}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="display-name"
          value={value}
          maxLength={80}
          autoComplete="name"
          placeholder={me.data?.user.email ?? ""}
          onChange={(e) => {
            setTouched(true);
            setValue(e.target.value);
          }}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
        />
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="min-h-11 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {save.isPending ? t("loading") : t("save")}
        </button>
      </div>
    </div>
  );
}
