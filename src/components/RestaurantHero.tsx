import { API_BASE_URL, type Branding } from "@/lib/api";

/**
 * La cara del restaurante, encima de todo lo demás.
 *
 * Es lo que le dice a alguien que acaba de escanear un código que está en el
 * sitio en el que está sentado, antes de leer una palabra. Sin esto, las dos
 * pantallas empezaban con el nombre del local en la tipografía de la app y
 * nada más, que es indistinguible de cualquier otro restaurante.
 *
 * Las dos imágenes son opcionales y se degrada en orden: con portada y logo se
 * ve la portada con el logo encima; sólo con logo, el logo centrado; sin
 * ninguna, sólo el texto y ni un hueco reservado -- una carta sin portada tiene
 * que verse deliberada, no a medio cargar.
 */
export function RestaurantHero({
  branding,
  name,
  above,
}: {
  branding: Branding;
  name: string;
  /** Lo que va encima del nombre en letra pequeña: la mesa, normalmente. */
  above?: string;
}) {
  const cover = branding.coverUrl ? `${API_BASE_URL}${branding.coverUrl}` : null;
  const logo = branding.logoUrl ? `${API_BASE_URL}${branding.logoUrl}` : null;

  return (
    <div>
      {cover && (
        <div className="relative -mx-5 h-40 overflow-hidden sm:h-48">
          <img src={cover} alt="" className="h-full w-full object-cover" />
          {/* Un degradado hacia el fondo de la página: sin él, el borde de una
              foto cortada en seco parece un error de carga. */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-background" />
        </div>
      )}

      {/* `relative` no es decorativo: la portada de arriba está posicionada, y
          un elemento posicionado se pinta por encima de uno que no lo está --
          en el navegador el logo salía cortado por la mitad, con la parte de
          arriba detrás de la foto. */}
      <div
        className={`relative flex flex-col items-center text-center ${cover ? "-mt-8" : "pt-2"}`}
      >
        {logo && (
          <img
            src={logo}
            alt=""
            className="h-16 w-16 rounded-full border-2 border-background bg-background object-cover shadow-sm"
          />
        )}
        {above && (
          <p
            className={`text-xs uppercase tracking-widest text-muted-foreground ${logo ? "mt-3" : ""}`}
          >
            {above}
          </p>
        )}
        <h1 className="mt-1 font-display text-3xl">{name}</h1>
      </div>
    </div>
  );
}
