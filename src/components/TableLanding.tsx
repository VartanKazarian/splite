import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Receipt } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { ApiError, guest, guestSession, scannedQr } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";
import { GuestBillScreen } from "@/components/GuestBillScreen";
import { PublicMenuScreen } from "@/components/PublicMenuScreen";

type View = "landing" | "menu" | "bill";

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
  const [view, setView] = useState<View>(demo ? "bill" : "landing");
  // El token del QR: llega en la URL una vez y luego vive en la pestaña.
  const [token, setToken] = useState<string | null>(() => qr ?? scannedQr.get());

  useEffect(() => {
    if (demo || !qr) return;
    // Un código nuevo es una mesa distinta: la sesión vieja podría ser de otra
    // mesa, y arrastrarla enseñaría la cuenta equivocada.
    if (qr !== scannedQr.get()) guestSession.set(null);
    scannedQr.set(qr);
    setToken(qr);
    if (typeof window === "undefined") return;
    // Fuera de la barra de direcciones: no debe salir en una captura ni quedar
    // en el historial de un móvil prestado.
    const url = new URL(window.location.href);
    url.searchParams.delete("qr");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [qr, demo]);

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

  // La rama de la cuenta es el flujo de siempre, sin tocar: es quien abre la
  // sesión, y por eso recibe el token.
  //
  // Sólo si no hay ya una sesión guardada. Con el token puesto, GuestBillScreen
  // descarta la sesión anterior y acuña otra, y aquí se entra y se sale de esta
  // pantalla -- ir a la carta y volver acuñaría una sesión por vuelta. Si la
  // guardada resultara estar caducada, esa pantalla la borra y avisa; al volver
  // aquí y pulsar de nuevo ya no hay ninguna, así que se acuña con el token.
  if (view === "bill") {
    const reuse = Boolean(guestSession.get());
    return <GuestBillScreen {...(token && !reuse ? { qr: token } : {})} />;
  }

  // Sin token y sin sesión no hay nada que resolver: hay que volver a escanear.
  if (!token) {
    if (guestSession.get()) return <GuestBillScreen />;
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
      <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <button
            onClick={() => setView("landing")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {context.table.name}
          </button>
        </header>
        <div className="surface p-6">
          <h1 className="text-3xl">{t("theMenu")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{context.restaurant.name}</p>
          <div className="mt-6">
            <PublicMenuScreen restaurantId={context.restaurant.id} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16">
      <header className="flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("brand")}
        </Link>
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
            onClick={() => setView("menu")}
          />
          <Choice
            icon={<Receipt className="h-5 w-5" />}
            title={t("yourBill")}
            // Lo único que dice del dinero: si hay cuenta abierta. Cuánto se debe
            // está detrás de la sesión, que aún no se ha abierto.
            hint={context.hasOpenBill ? t("yourBillHint") : t("noOpenBillYet")}
            onClick={() => setView("bill")}
          />
        </div>
      </div>
    </div>
  );
}

function Choice({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-lg border border-border bg-secondary px-4 py-4 text-left transition-colors hover:border-primary"
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
      <header className="flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("brand")}
        </Link>
      </header>
      <div className="surface p-6">{children}</div>
    </div>
  );
}
