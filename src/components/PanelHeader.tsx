import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  LayoutGrid,
  LogOut,
  Settings as SettingsIcon,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { auth, payments } from "@/lib/api";
import { LangToggle } from "@/components/LangToggle";

/**
 * La misma barra en todas las pantallas del panel.
 *
 * Antes sólo el panel de sala tenía navegación; la carta, las tasas, los pagos
 * y la configuración se despedían con un «Volver al panel». Ir de la carta a
 * los pagos costaba dos saltos pasando por una pantalla que no se quería ver,
 * y ninguna decía en cuál estabas.
 *
 * Se enseñan todos los destinos a todo el mundo aunque el rol no pueda con
 * alguno. No es lo mismo que la fila de saltos de Configuración, donde un
 * enlace a un ancla inexistente no hacía absolutamente nada: aquí la pantalla
 * a la que se llega explica que ese rol no puede editar la carta. Además el
 * permiso lo decide el servidor, y repetir esa política aquí es tenerla en dos
 * sitios y equivocarse en uno.
 */
export function PanelHeader({
  current,
}: {
  current: "dashboard" | "menu" | "tasas" | "pagos" | "settings";
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });

  // El resumen, no la lista. El panel de sala contaba `claims("PENDING")`, que
  // trae hasta cien avisos enteros -- con el teléfono de quien pagó -- para
  // pintar un número; el backend tiene un endpoint aparte justo para esto y lo
  // dice en su propio comentario. Ahí sólo era una pantalla. Aquí se sondea
  // desde las cinco, así que la diferencia deja de ser teórica.
  const claims = useQuery({
    queryKey: ["payment-claims", "summary"],
    queryFn: () => payments.claimsSummary(),
    enabled: me.isSuccess,
    retry: false,
    refetchInterval: 20000,
  });
  const pending = claims.data?.pending ?? 0;

  const items = [
    { key: "dashboard", to: "/dashboard", icon: LayoutGrid, label: t("dashboard") },
    { key: "menu", to: "/menu", icon: UtensilsCrossed, label: t("manageMenu") },
    { key: "tasas", to: "/tasas", icon: TrendingUp, label: t("fxRates") },
    { key: "pagos", to: "/pagos", icon: BadgeCheck, label: t("paymentsNav"), badge: pending },
    { key: "settings", to: "/settings", icon: SettingsIcon, label: t("settings") },
  ] as const;

  return (
    <header className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-4">
        {/* Dos filas fijas, no un wrap: quién eres y salir arriba, los
            destinos abajo. Dejándolo al wrap, en un móvil de 390px se partía
            en tres filas -- 185px de cabecera de una pantalla de 844. */}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <Link to="/" className="shrink-0 font-display text-2xl">
              {t("brand")}
            </Link>
            {/* Quién ha entrado, en una sola línea siempre. En el móvil se queda
              el correo a secas: es lo que contesta "¿estoy yo o el turno de
              antes?" cuando el teléfono se comparte, y era lo que hacía que la
              cabecera ocupara tres filas de una pantalla de 844px. El rol se
              lee entero en Configuración. */}
            {me.data && (
              <span className="truncate text-sm text-muted-foreground">
                <span className="hidden sm:inline">
                  {t("signedInAs")} {me.data.user.email} · {t(`role${me.data.user.role}` as never)}
                </span>
                <span className="sm:hidden">{me.data.user.email}</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LangToggle />
            <button
              onClick={async () => {
                await auth.logout();
                queryClient.clear();
                navigate({ to: "/" });
              }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" /> {t("logout")}
            </button>
          </div>
        </div>

        {/* En el móvil se desliza en lugar de partirse: el panel se usa de pie
            en el comedor, y una cabecera alta deja la pantalla para nada. */}
        <nav className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const active = item.key === current;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
                {/* El contador de avisos por verificar viaja con la barra. Era
                    lo único que decía "hay dinero esperando" y sólo se veía
                    desde el panel de sala. */}
                {"badge" in item && item.badge > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      active
                        ? "bg-primary-foreground text-primary"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
