import { useQuery } from "@tanstack/react-query";

import { useI18n } from "@/lib/i18n";
import { account, auth } from "@/lib/api";
import { NameNudge } from "./NameNudge";

/**
 * A quién saluda esto y de qué restaurante habla.
 *
 * El panel abría con un «Panel» a 3xl, que es la palabra que ya está resaltada
 * en la barra de navegación justo encima: dos centímetros de pantalla para
 * repetir dónde estás. Aquí va lo que sí cambia entre un turno y otro.
 *
 * **El nombre, o ninguno.** Si la persona lo ha puesto en Configuración, ese.
 * Si no, nada: «Buenas noches» a secas.
 *
 * Antes se sacaba de la parte del correo anterior a la arroba, y el resultado
 * era una persona inventada. `vacia@example.com` saludaba a «Vacia» y
 * `gerencia@casa72.com` a «Gerencia»: no son nombres de nadie, son cadenas que
 * se parecen a uno lo justo para que parezca que el sistema cree saber quién
 * eres y se ha equivocado. Un saludo sin nombre no se equivoca en nada, y
 * justo debajo hay una fila que pregunta cómo te llamas.
 */
function greetingName(user: { email: string; displayName?: string | null } | undefined): string {
  return user?.displayName?.trim() ?? "";
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

  const name = greetingName(me.data?.user);
  const restaurant = accountQuery.data?.name;
  // Con nombre puesto no hay nada que pedir; sin él, el saludo de aquí arriba
  // es exactamente el sitio donde se está viendo el correo de alguien.
  const asksName = me.isSuccess && !me.data.user.displayName?.trim();

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
        {asksName && <NameNudge />}
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
