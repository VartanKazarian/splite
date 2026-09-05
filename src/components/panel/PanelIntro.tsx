import { useQuery } from "@tanstack/react-query";

import { useI18n } from "@/lib/i18n";
import { account, auth } from "@/lib/api";

/**
 * A quién saluda esto y de qué restaurante habla.
 *
 * El panel abría con un «Panel» a 3xl, que es la palabra que ya está resaltada
 * en la barra de navegación justo encima: dos centímetros de pantalla para
 * repetir dónde estás. Aquí va lo que sí cambia entre un turno y otro.
 *
 * **El nombre.** El backend no guarda un nombre de persona: `/auth/me` da
 * `{ id, email, role, restaurantId }` y nada más. Así que el saludo usa la
 * parte del correo anterior a la arroba, que es dato real y no inventado. En
 * cuanto exista un campo de nombre, esta función es el único sitio que cambia.
 */
function displayName(email: string | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  if (!local) return "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Buenos días / buenas tardes / buenas noches, por el reloj de quien mira.
 * Es presentación: no toca ninguna regla ni ninguna zona horaria del negocio.
 */
function greetingKey(now = new Date()): "greetMorning" | "greetAfternoon" | "greetEvening" {
  const hour = now.getHours();
  if (hour < 12) return "greetMorning";
  if (hour < 20) return "greetAfternoon";
  return "greetEvening";
}

/**
 * `live` es de verdad: el plano se vuelve a pedir cada ocho segundos. Cuando
 * esa consulta falla se dice, en vez de dejar un punto verde encendido sobre
 * datos congelados -- que es exactamente el momento en que alguien confiaría en
 * una cifra vieja.
 */
export function PanelIntro({ live }: { live: boolean }) {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });

  const name = displayName(me.data?.user.email);
  const restaurant = accountQuery.data?.name;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl">
          {t(greetingKey())}
          {name ? `, ${name}` : ""}
        </h1>
        {restaurant && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("greetSub").replace("{name}", restaurant)}
          </p>
        )}
      </div>

      <p
        className={`inline-flex shrink-0 items-center gap-2 text-xs ${
          live ? "text-muted-foreground" : "text-amber-600"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${live ? "bg-primary" : "bg-amber-500"}`}
        />
        {live ? t("liveNow") : t("liveStale")}
      </p>
    </div>
  );
}
