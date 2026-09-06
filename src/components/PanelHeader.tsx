import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Bell,
  BellOff,
  LayoutGrid,
  LayoutPanelTop,
  LogOut,
  Settings as SettingsIcon,
  UtensilsCrossed,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { account, auth, payments } from "@/lib/api";
import { LangToggle } from "@/components/LangToggle";
import { PlanBanner } from "@/components/PlanBanner";
import { chime, chimeEnabled, useOrderChime } from "@/lib/chime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * La misma barra en todas las pantallas del panel.
 *
 * Antes sólo el panel de sala tenía navegación; la carta, las tasas, los pagos
 * y la configuración se despedían con un «Volver al panel». Ir de la carta a
 * los pagos costaba dos saltos pasando por una pantalla que no se quería ver,
 * y ninguna decía en cuál estabas.
 *
 * Se enseñan todos los destinos a todo el mundo aunque el rol no pueda con
 * alguno. El permiso lo decide el servidor, y repetir esa política aquí es
 * tenerla en dos sitios y equivocarse en uno.
 *
 * **Quién manda en la cabecera.** El correo iba en grande al lado del
 * logotipo, así que lo más prominente después de la marca era una dirección de
 * email. Lo que un turno necesita ver ahí es de qué restaurante es este panel:
 * el correo contesta "¿estoy yo?", que se pregunta una vez al entrar, y ahora
 * vive detrás del avatar junto con el idioma, Configuración y salir.
 */
export function PanelHeader({
  current,
}: {
  current: "dashboard" | "mesas" | "menu" | "pagos" | "settings";
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });

  // El nombre del restaurante, de la misma consulta que ya usan Configuración
  // y la lista de comprobación: una clave compartida, no una llamada más.
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });

  // El resumen, no la lista. El panel de sala contaba `claims("PENDING")`, que
  // trae hasta cien avisos enteros -- con el teléfono de quien pagó -- para
  // pintar un número; el backend tiene un endpoint aparte justo para esto.
  const claims = useQuery({
    queryKey: ["payment-claims", "summary"],
    queryFn: () => payments.claimsSummary(),
    enabled: me.isSuccess,
    retry: false,
    refetchInterval: 20000,
  });
  const pending = claims.data?.pending ?? 0;

  /**
   * El aviso sonoro de que ha entrado un pedido.
   *
   * Aquí y no en la bandeja del panel de inicio: la bandeja vive en una
   * pantalla y un mesero trabaja desde Mesas. La cabecera está en las cinco.
   */
  useOrderChime(me.isSuccess);
  const [sound, setSound] = useState(true);
  useEffect(() => setSound(chimeEnabled.get()), []);

  // Configuración sale de la barra y se va al menú del avatar: es un destino de
  // cuenta, no una parada del turno.
  const items = [
    { key: "dashboard", to: "/dashboard", icon: LayoutGrid, label: t("dashboard") },
    { key: "mesas", to: "/mesas", icon: LayoutPanelTop, label: t("tablesNav") },
    { key: "menu", to: "/menu", icon: UtensilsCrossed, label: t("manageMenu") },
    { key: "pagos", to: "/pagos", icon: BadgeCheck, label: t("paymentsNav"), badge: pending },
  ] as const;

  const email = me.data?.user.email ?? "";
  const initial = (email.trim()[0] ?? "·").toUpperCase();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-4 pt-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex min-h-11 shrink-0 items-center font-display text-2xl leading-none"
            >
              {t("brand")}
            </Link>

            {/* De qué restaurante es este panel. Sin desplegable: una cuenta de
                Splite es un restaurante, así que un menú de un solo elemento
                sería un gesto que no lleva a ninguna parte. */}
            {accountQuery.data ? (
              <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {accountQuery.data.name}
              </p>
            ) : (
              <span className="flex-1" />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("account")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {initial}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {me.data && (
                  <>
                    <DropdownMenuLabel className="font-normal">
                      <span className="block truncate text-sm">{me.data.user.email}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`role${me.data.user.role}` as never)}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <div className="px-2 py-1.5">
                  <LangToggle />
                </div>
                {/* Aquí y no en Configuración: es una preferencia de este
                    aparato -- el móvil del mesero sí, el portátil de la oficina
                    no -- y se cambia cuando molesta, no cuando se está
                    configurando el restaurante. Suena al encenderlo, que es la
                    única forma de comprobar que el navegador deja sonar. */}
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={(event) => {
                    // Sin esto el menú se cierra y no se llega a oír nada.
                    event.preventDefault();
                    const next = !sound;
                    chimeEnabled.set(next);
                    setSound(next);
                    if (next) chime();
                  }}
                >
                  {sound ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {sound ? t("chimeOn") : t("chimeOff")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <SettingsIcon className="h-4 w-4" /> {t("settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={async () => {
                    await auth.logout();
                    queryClient.clear();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="h-4 w-4" /> {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Cuatro destinos, y por eso vuelven los iconos.
              Con cinco no cabían: medí las etiquetas con la tipografía de
              verdad y en inglés sumaban 420 px de los 361 que hay a 393 px de
              ventana -- en castellano sí entraban, así que la barra habría
              funcionado en un idioma y no en el otro. Sin ellos entraban las
              cinco, y así estuvo.
              Tasas se ha ido dentro de Pagos, que es donde se cuadra el
              dinero, y con cuatro paradas el icono cabe en los dos idiomas:
              Con `gap-1` y `px-0.5`, 268 px en castellano y 330 en inglés, que
              es lo que hace falta para que también entre en un Android de 360. No es decoración -- es lo
              que se reconoce sin leer cuando se mira el teléfono de pie en el
              comedor.
              `flex-auto` en vez de un hueco entre ellas: lo que sobra se
              reparte *dentro* de las paradas, así que ninguna baja de 44x44.
              Subrayado en vez de píldora rellena: cuatro cápsulas verdes
              competían con el único botón verde que de verdad hace algo. */}
          <nav
            aria-label={t("dashboard")}
            className="mt-1 flex justify-between overflow-x-auto [scrollbar-width:none] sm:justify-start sm:gap-1 [&::-webkit-scrollbar]:hidden"
          >
            {items.map((item) => {
              const active = item.key === current;
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 flex-auto items-center justify-center gap-1 whitespace-nowrap border-b-2 px-0.5 text-[13px] transition-colors sm:flex-none sm:shrink-0 sm:justify-start sm:gap-2 sm:px-3 sm:text-sm ${
                    active
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0" /> {item.label}
                  {/* El contador de avisos por verificar viaja con la barra. Era
                      lo único que decía "hay dinero esperando" y sólo se veía
                      desde el panel de sala. */}
                  {"badge" in item && item.badge > 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none text-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      {/* Debajo de la barra, no dentro: es un aviso, no un destino. Al vivir
          aquí sale en las pantallas del panel sin repetirlo en cinco sitios. */}
      <PlanBanner />
    </>
  );
}
