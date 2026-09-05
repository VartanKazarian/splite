import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { account } from "@/lib/api";

/** A partir de aquí la prueba se avisa. Antes es ruido: se ve en Configuración. */
const WARN_WITHIN_DAYS = 7;

/**
 * El aviso de que la prueba se acaba.
 *
 * El backend guarda `plan_tier` y `trial_ends_at` y encima del endpoint hay una
 * nota explícita: «una prueba que nadie ve es una prueba que caduca sin aviso
 * [...] las fechas se reportan y el frontend avisa». El frontend no avisaba.
 * Se podía llegar al final de la prueba sin que ninguna pantalla lo hubiera
 * mencionado nunca.
 *
 * Lo que NO dice: que se vaya a desactivar algo. Nada en el backend corta el
 * servicio cuando la prueba termina -- se comprobó buscando en middleware,
 * rutas y servicios -- y el propio comentario explica por qué: cortar las
 * cuentas a media cena deja un comedor lleno de clientes sentados por una
 * factura sin pagar. Amenazar con un corte que el código no hace sería mentir
 * en el único sitio donde el restaurante nos cree del todo.
 *
 * Aparece sólo cuando queda poco o ya pasó. Un banner permanente se convierte
 * en papel pintado, y entonces tampoco se lee el que sí importa.
 */
export function PlanBanner() {
  const { t, lang } = useI18n();

  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });

  const plan = accountQuery.data?.plan;
  if (!plan || plan.tier !== "TRIAL") return null;

  const days = plan.trialDaysRemaining;
  if (days === null || days > WARN_WITHIN_DAYS) return null;

  const ended = days <= 0;
  const endsOn = plan.trialEndsAt
    ? new Date(plan.trialEndsAt).toLocaleDateString(lang === "en" ? "en-GB" : "es-VE", {
        day: "numeric",
        month: "long",
      })
    : null;

  const message = ended
    ? t("planTrialEnded").replace("{date}", endsOn ?? "")
    : (days === 1 ? t("planTrialEndsOneDay") : t("planTrialEndsDays")).replace(
        "{days}",
        String(days),
      );

  return (
    <div
      className={`border-b ${
        ended ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-secondary/60"
      }`}
    >
      {/* El icono cuelga a la izquierda y el texto fluye a su lado. Con
          `flex-wrap` el icono se quedaba solo en su propia línea y el aviso
          ocupaba tres en un móvil de 390px. El enlace va dentro del párrafo,
          no al lado: así se queda pegado al final de la frase en vez de
          empezar una línea suya. */}
      <div className="mx-auto flex max-w-6xl items-start gap-2 px-5 py-2.5 text-sm">
        {ended ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <p className="min-w-0">
          {message}{" "}
          <Link to="/settings" hash="cobros" className="underline underline-offset-2">
            {t("planSeePlan")}
          </Link>
        </p>
      </div>
    </div>
  );
}
