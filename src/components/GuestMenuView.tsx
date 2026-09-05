import type { ReactNode } from "react";

import { PublicMenuScreen } from "@/components/PublicMenuScreen";
import { RestaurantHero } from "@/components/RestaurantHero";
import type { Branding } from "@/lib/api";

/**
 * La carta tal y como la lee alguien sentado a una mesa.
 *
 * Vive aparte porque la pintan dos sitios: el móvil del comensal y la vista
 * previa del panel. Copiarla en el segundo era la forma segura de que dentro de
 * tres cambios la vista previa enseñara algo que ya no existe -- y una vista
 * previa que miente es peor que no tenerla, porque se confía en ella.
 *
 * Sin la tarjeta ni el `px-5` del resto de pantallas: la carta va de borde a
 * borde, con sus propios márgenes por fila y separadores de ancho completo, que
 * es como se lee una carta y no un formulario.
 */
export function GuestMenuView({
  restaurantId,
  branding,
  name,
  above,
  /** Lo que va arriba a la izquierda. En la mesa, volver; en la vista previa, nada. */
  back,
}: {
  restaurantId: string;
  branding: Branding;
  name: string;
  above: string;
  back?: ReactNode;
}) {
  return (
    <div className={`mx-auto min-h-screen w-full max-w-md ${back ? "" : "pt-5"}`}>
      {/* Sólo si hay algo que poner. Un `<header>` vacío sigue ocupando su
          alto: en la vista previa del panel, donde no hay a dónde volver,
          dejaba un dedo de hueco encima de la portada. */}
      {back && <header className="flex items-center justify-between px-5 py-5">{back}</header>}
      <div className="px-5 pb-3">
        <RestaurantHero branding={branding} name={name} above={above} />
      </div>
      <PublicMenuScreen restaurantId={restaurantId} />
    </div>
  );
}
