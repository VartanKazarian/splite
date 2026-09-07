import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth } from "@/lib/api";

/**
 * Pedir el nombre una vez, donde se nota que falta.
 *
 * El campo existe desde la migración 035 y está en Configuración → Tu cuenta,
 * y por eso no lo rellena nadie: nada lo pide, y quien no ha entrado ahí no
 * sabe que existe. Mientras esté vacío, el panel saluda a "Gerencia" (la parte
 * del correo antes de la arroba), el desplegable de "Atendida por" enseña
 * `gerencia@casa72.com` entero en un teléfono, y el reparto de propinas agrupa
 * por direcciones de correo -- que es la lista que alguien reparte en mano al
 * final del turno.
 *
 * Va pegado al saludo y no en una tarjeta aparte porque ahí es donde se está
 * viendo el nombre equivocado. Una fila y una línea de explicación; en cuanto
 * hay nombre desaparece para siempre.
 *
 * **Y se puede decir que no.** Nadie está obligado a llamarse de otra forma, y
 * un aviso que vuelve cada mañana deja de leerse -- que es justo lo que le pasa
 * al que sí importa, el de configurar dónde se cobra. El "ahora no" se guarda
 * en este aparato: es una preferencia de quien mira, no del restaurante, y no
 * merece un viaje al servidor.
 */
const DISMISSED_KEY = "splite.nameNudge.dismissed";

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Navegador con el almacenamiento cerrado: se enseña, que es el
    // comportamiento útil. Nunca es motivo para romper el panel.
    return false;
  }
}

export function NameNudge({ email }: { email: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  // En un efecto y no en el primer render: esto se pinta también en el
  // servidor, donde no hay `localStorage`, y leerlo directamente daría dos
  // marcados distintos.
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(dismissed()), []);

  const [value, setValue] = useState("");

  const save = useMutation({
    mutationFn: () => auth.setDisplayName(value.trim()),
    onSuccess: (result) => {
      // La respuesta trae el usuario entero: se siembra la caché y el saludo de
      // arriba cambia sin pedir /me otra vez. Y con nombre puesto, esta fila
      // deja de cumplir su condición y se va sola.
      queryClient.setQueryData(["me"], result);
      toast.success(t("saved"));
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? t("displayNameFailed") : t("apiDown")),
  });

  if (hidden) return null;

  return (
    <div className="mt-3 max-w-lg">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          maxLength={80}
          autoComplete="name"
          placeholder={email}
          aria-label={t("displayName")}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
        />
        <button
          type="button"
          disabled={!value.trim() || save.isPending}
          onClick={() => save.mutate()}
          className="min-h-11 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {save.isPending ? t("loading") : t("save")}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              /* sin almacenamiento se esconde igual, hasta que se recargue */
            }
            setHidden(true);
          }}
          className="min-h-11 whitespace-nowrap rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary"
        >
          {t("nameNudgeLater")}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("nameNudgeHint")}</p>
    </div>
  );
}
