import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Smartphone } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { PanelHeader } from "@/components/PanelHeader";
import { GuestMenuView } from "@/components/GuestMenuView";
import { ErrorBox } from "@/routes/dashboard";
import { account, menu, staffSession, tables as tablesApi, GUEST_BASE_URL } from "@/lib/api";

export const Route = createFileRoute("/preview")({
  head: () => ({ meta: [{ title: "Vista del comensal — Splite" }] }),
  component: PreviewPage,
});

/**
 * Lo que ve un comensal, desde el panel y sin levantarse de la silla.
 *
 * Hasta ahora la única forma de saber cómo había quedado la carta era imprimir
 * un código, ir a una mesa y escanearlo con el móvil. Así que en la práctica
 * nadie lo comprobaba, y los precios, las fotos y el orden de las secciones se
 * publicaban a ciegas.
 *
 * No es una maqueta: pinta los mismos componentes que el móvil del comensal
 * -- `GuestMenuView`, y dentro `RestaurantHero` y `PublicMenuScreen` --
 * consultando el mismo endpoint público. Una vista previa dibujada aparte
 * acaba enseñando algo que ya no existe, y encima se confía en ella.
 *
 * Sólo la carta. La cuenta no se puede previsualizar sin mentir: necesita una
 * mesa con consumo y abrir una sesión de comensal, y fabricar ambas cosas
 * desde el panel sería inventar datos en la mesa de alguien. Para eso está el
 * enlace a una mesa de verdad.
 */
function PreviewPage() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (staffSession.get()) setReady(true);
  }, []);

  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    enabled: ready,
    retry: false,
  });
  const restaurantId = accountQuery.data?.id;

  const menuQuery = useQuery({
    queryKey: ["public-menu", restaurantId],
    enabled: Boolean(restaurantId),
    retry: false,
    queryFn: () => menu.publicMenu(restaurantId!),
  });

  // Una mesa cualquiera, sólo para ofrecer el enlace de verdad. Si no hay
  // ninguna todavía, no se ofrece: un botón que lleva a una mesa inexistente
  // enseña un error, no una vista previa.
  const floorQuery = useQuery({
    queryKey: ["floor"],
    queryFn: () => tablesApi.floor(),
    enabled: ready,
    retry: false,
  });
  const firstTable = floorQuery.data?.[0];

  const qrQuery = useQuery({
    queryKey: ["qr", firstTable?.id],
    enabled: Boolean(firstTable?.id),
    retry: false,
    queryFn: () => tablesApi.qrToken(firstTable!.id),
  });
  const liveUrl = qrQuery.data
    ? `${GUEST_BASE_URL}/t?qr=${encodeURIComponent(qrQuery.data.token)}`
    : null;

  if (!ready) return null;

  return (
    <div className="min-h-screen">
      <PanelHeader current="menu" />

      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">{t("previewTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("previewSub")}</p>
          </div>
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              <ExternalLink className="h-4 w-4" /> {t("previewOpenReal")}
            </a>
          )}
        </div>

        {(accountQuery.isError || menuQuery.isError) && (
          <div className="mt-6">
            <ErrorBox
              error={(accountQuery.error ?? menuQuery.error) as unknown}
              fallback={t("apiDown")}
            />
          </div>
        )}

        {/* El marco de teléfono no es adorno: sin él se mira la carta en un
            monitor de 27 pulgadas y se da por buena una línea que en un móvil
            ocupa tres. El ancho es el de la pantalla del comensal. */}
        {menuQuery.data && restaurantId && (
          <div className="mt-6 flex justify-center">
            <div className="w-full max-w-[420px] overflow-hidden rounded-[2rem] border-[10px] border-foreground/85 bg-background shadow-xl">
              <div className="max-h-[70vh] overflow-y-auto">
                <GuestMenuView
                  restaurantId={restaurantId}
                  branding={menuQuery.data.restaurant}
                  name={menuQuery.data.restaurant.name}
                  above={t("theMenu")}
                />
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" /> {t("previewNote")}{" "}
          <Link to="/menu" className="underline">
            {t("previewBackToEdit")}
          </Link>
        </p>
      </main>
    </div>
  );
}
