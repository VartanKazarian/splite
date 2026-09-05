import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Receipt } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { ApiError, guest, guestSession, scannedQr } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";
import { GuestBillScreen } from "@/components/GuestBillScreen";
import { PublicMenuScreen } from "@/components/PublicMenuScreen";
import type { GuestView } from "@/lib/guest-view";

type View = GuestView | "landing";

/**
 * Lo que se ve al escanear el QR de una mesa.
 *
 * Antes el código sólo sabía hacer una cosa -- abrir la cuenta -- así que quien
 * lo escaneaba para leer la carta abría una sesión igual, y la carta seguía sin
 * poder verse: el endpoint público necesita el id del restaurante y la única
 * forma de conocerlo era abrir sesión antes. Las dos cosas que hace alguien
 * sentado a una mesa estaban detrás de la misma puerta.
 *
 * `POST /guest/qr/context` resuelve el código sin abrir nada, y aquí se elige.
 * La sesión se sigue gastando sólo en la rama de la cuenta.
 */
export function TableLanding({ qr, demo = false }: { qr?: string; demo?: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  // La pantalla vive en la URL, no en un estado interno.
  //
  // Con estado interno, el botón "atrás" del teléfono -- que es con el que
  // vuelve de verdad alguien sentado a una mesa -- no veía ni la carta ni la
  // cuenta: se llevaba al comensal fuera del sitio, a la página de Splite. Con
  // la pantalla en la URL, atrás va de la cuenta a la carta y de la carta a la
  // mesa, y recargar deja al comensal donde estaba.
  //
  // `strict: false` porque esto se pinta bajo dos rutas, /t/ y el comodín
  // /t/$, y las dos declaran el mismo parámetro.
  const search = useSearch({ strict: false }) as { view?: GuestView };
  const view: View = demo ? "bill" : (search.view ?? "landing");

  /**
   * Cambia de pantalla dejando rastro en el historial.
   *
   * `replace: false` a propósito: cada paso tiene que ser una entrada para que
   * atrás retroceda una pantalla en vez de salirse. El token se mantiene en la
   * URL con `search` -- perderlo dejaría la mesa sin identificar al recargar.
   */
  const go = (next: View) => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const rest = { ...prev };
        delete rest["view"];
        return next === "landing" ? rest : { ...rest, view: next };
      },
    });
  };
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<unknown>(null);
  // El token del QR: llega en la URL una vez y luego vive en la pestaña.
  //
  // Inicializado sólo con lo que trae la URL, nunca leyendo `sessionStorage`
  // aquí. Esto se renderiza también en el servidor, donde ese almacén no
  // existe: leerlo en el primer render hace que servidor y cliente pinten
  // cosas distintas y React tire la hidratación entera. Se lee en el efecto,
  // que sólo corre en el navegador.
  const [token, setToken] = useState<string | null>(qr ?? null);
  // Si ya se ha consultado el almacén. Mientras es false, servidor y cliente
  // pintan lo mismo.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (demo) return;
    if (!qr) {
      // Una recarga después de limpiar la URL: el token sigue en la pestaña.
      const stored = scannedQr.get();
      if (stored) setToken(stored);
      setRestored(true);
      return;
    }
    // Un código nuevo es una mesa distinta: la sesión vieja podría ser de otra
    // mesa, y arrastrarla enseñaría la cuenta equivocada.
    if (qr !== scannedQr.get()) guestSession.set(null);
    scannedQr.set(qr);
    setToken(qr);
    setRestored(true);
    if (typeof window === "undefined") return;
    // Fuera de la barra de direcciones: no debe salir en una captura ni quedar
    // en el historial de un móvil prestado.
    const url = new URL(window.location.href);
    url.searchParams.delete("qr");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [qr, demo]);

  /**
   * Pasar a la cuenta, acuñando la sesión aquí si hace falta.
   *
   * La sesión se acuña en el manejador del clic, no pasándole el token del QR a
   * GuestBillScreen: esa pantalla acuña dentro de un `useEffect` en cuanto ve
   * la prop, y desde aquí se monta dos veces -- medido en un navegador de
   * verdad, dos POST /guest/sessions por una sola pulsación, mientras que la
   * ruta antigua montaba una sola vez y acuñaba una. Un clic ocurre una vez;
   * un efecto ocurre las que React decida.
   *
   * Así que la cuenta se abre siempre sin token y lee la sesión ya guardada.
   * Si esa sesión estuviera caducada, GuestBillScreen la borra y lo dice; al
   * volver aquí y pulsar otra vez ya no hay ninguna y se acuña de nuevo.
   */
  const openBill = async () => {
    if (guestSession.get() || !token) {
      go("bill");
      return;
    }
    setOpening(true);
    setOpenError(null);
    try {
      await guest.openSession(token);
      go("bill");
    } catch (error) {
      setOpenError(error);
    } finally {
      setOpening(false);
    }
  };

  const contextQuery = useQuery({
    queryKey: ["qr-context", token],
    enabled: !demo && Boolean(token),
    retry: false,
    // El código está impreso: no caduca, y la respuesta sólo cambia cuando se
    // abre o se cierra una cuenta. Se refresca al volver a la pantalla.
    staleTime: 30_000,
    queryFn: () => guest.qrContext(token as string),
  });

  if (demo) return <GuestBillScreen demo />;

  // Hasta que el efecto haya mirado el almacén de la pestaña no se sabe si hay
  // token ni sesión, y adivinarlo es exactamente lo que rompe la hidratación.
  if (!restored) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </Shell>
    );
  }

  // Sin token: la sesión ya está guardada, la acuñó `openBill`.
  if (view === "bill") return <GuestBillScreen onBack={() => go("landing")} />;

  // Sin token y sin sesión no hay nada que resolver: hay que volver a escanear.
  if (!token) {
    if (guestSession.get()) return <GuestBillScreen onBack={() => go("landing")} />;
    return (
      <Shell>
        <h1 className="text-3xl">{t("yourBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("scanNeeded")}</p>
      </Shell>
    );
  }

  if (contextQuery.isLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </Shell>
    );
  }

  if (contextQuery.isError) {
    const code = contextQuery.error instanceof ApiError ? contextQuery.error.code : undefined;
    // Un código rotado y una mesa que no existe responden lo mismo, a propósito.
    if (code === "QR_INVALID" || code === "QR_TOKEN_INVALID") {
      return (
        <Shell>
          <h1 className="text-3xl">{t("qrInvalidTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("qrInvalid")}</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="text-3xl">{t("errorTitle")}</h1>
        <ErrorBox error={contextQuery.error} fallback={t("apiDown")} />
      </Shell>
    );
  }

  const context = contextQuery.data!;

  if (view === "menu") {
    return (
      // Sin la tarjeta ni el `px-5` del resto de pantallas: la carta va de
      // borde a borde, con sus propios márgenes por fila y sus separadores de
      // ancho completo, que es como se lee una carta y no un formulario.
      <div className="mx-auto min-h-screen w-full max-w-md">
        <header className="flex items-center justify-between px-5 py-5">
          <button
            onClick={() => go("landing")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {context.table.name}
          </button>
        </header>
        <div className="px-5 pb-1">
          <h1 className="text-3xl">{t("theMenu")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{context.restaurant.name}</p>
        </div>
        <PublicMenuScreen restaurantId={context.restaurant.id} />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16">
      {/* Sin enlace de salida: quien está sentado en la mesa no tiene nada que
          hacer en la página comercial de Splite, y era el único sitio al que
          llevaba esta cabecera. */}
      <header className="flex items-center justify-between py-5">
        <span className="text-sm text-muted-foreground">{t("brand")}</span>
      </header>

      <div className="surface p-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {context.table.name}
        </p>
        <h1 className="mt-1 text-3xl">{context.restaurant.name}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("landingPrompt")}</p>

        <div className="mt-6 space-y-3">
          <Choice
            icon={<BookOpen className="h-5 w-5" />}
            title={t("theMenu")}
            hint={t("theMenuHint")}
            onClick={() => go("menu")}
          />
          <Choice
            icon={<Receipt className="h-5 w-5" />}
            title={t("yourBill")}
            // Lo único que dice del dinero: si hay cuenta abierta. Cuánto se debe
            // está detrás de la sesión, que aún no se ha abierto.
            hint={context.hasOpenBill ? t("yourBillHint") : t("noOpenBillYet")}
            onClick={openBill}
            disabled={opening}
          />
        </div>

        {openError ? <ErrorBox error={openError} fallback={t("apiDown")} /> : null}
      </div>
    </div>
  );
}

function Choice({
  icon,
  title,
  hint,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 rounded-lg border border-border bg-secondary px-4 py-4 text-left transition-colors hover:border-primary disabled:opacity-60"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5">
      {/* Tampoco aquí. Estas pantallas son las de cargando, error y código
          inválido: lo que hay que hacer es volver a escanear la mesa, y la
          página comercial no ayuda a eso. */}
      <header className="flex items-center justify-between py-5">
        <span className="text-sm text-muted-foreground">{t("brand")}</span>
      </header>
      <div className="surface p-6">{children}</div>
    </div>
  );
}
