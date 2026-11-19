import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import { SITE_URL } from "@/lib/site";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/lib/i18n";
import { storedLang } from "@/lib/stored-lang";
// Los avisos flotantes los usa el panel, no el comensal: la librería (unos
// 33 KB) se carga aparte, después, en vez de viajar en el código de todas las
// páginas.
const Toaster = lazy(() => import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })));
import { installTelemetry, reportError } from "@/lib/telemetry";
import { ConnectionBanner } from "@/components/ConnectionBanner";

/**
 * Lo que dicen las pantallas de «no existe» y «algo falló», en los dos idiomas.
 *
 * Estaban en inglés -- «Page not found», «This page didn't load» -- en un
 * producto en español, y la de error se pinta fuera del proveedor de idioma
 * (sustituye a todo el árbol), así que no puede usar el diccionario. Lleva su
 * propio par de frases y lee el idioma guardado directamente.
 */
const FALLBACK_COPY = {
  es: {
    notFoundTitle: "Esta página no existe",
    notFoundBody: "Puede que el enlace esté mal copiado o que la página se haya movido.",
    errorTitle: "Esta página no cargó",
    errorBody:
      "Algo falló de nuestro lado. Prueba otra vez; si estabas pagando, tu pago no se ha perdido.",
    retry: "Probar otra vez",
    back: "Volver",
    home: "Ir al inicio",
  },
  en: {
    notFoundTitle: "This page does not exist",
    notFoundBody: "The link may have been copied wrong, or the page has moved.",
    errorTitle: "This page didn't load",
    errorBody:
      "Something went wrong on our side. Try again; if you were paying, your payment is not lost.",
    retry: "Try again",
    back: "Go back",
    home: "Go home",
  },
} as const;

/** En español al pintar en el servidor; el guardado, después: sin desajuste al hidratar. */
function useFallbackCopy() {
  const [lang, setLang] = useState<"es" | "en">("es");
  useEffect(() => {
    const stored = storedLang();
    if (stored) setLang(stored);
  }, []);
  return FALLBACK_COPY[lang];
}

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary";

function NotFoundComponent() {
  const copy = useFallbackCopy();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-6xl text-muted-foreground">404</p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{copy.notFoundTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.notFoundBody}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => window.history.back()} className={secondaryButton}>
            {copy.back}
          </button>
          <Link to="/" className={primaryButton}>
            {copy.home}
          </Link>
        </div>
      </div>
    </main>
  );
}

// `error` es `unknown`: con TanStack Router 1.170.46 el tipo dejó de suponer
// que lo lanzado es un Error, que es lo correcto -- se puede lanzar cualquier
// cosa. Nada de aquí lee sus propiedades, así que basta con aceptarlo tal cual.
function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const copy = useFallbackCopy();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    reportError(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{copy.errorTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.errorBody}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={primaryButton}
          >
            {copy.retry}
          </button>
          <a href="/" className={secondaryButton}>
            {copy.home}
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Splite — El QR que divide la cuenta y cobra por mesa" },
      {
        name: "description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Splite — El QR que divide la cuenta y cobra por mesa" },
      { name: "twitter:title", content: "Splite — El QR que divide la cuenta y cobra por mesa" },
      {
        property: "og:description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      {
        name: "twitter:description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
      { name: "google-site-verification", content: "xcKZYGfBHKsmRvI-POFUilb7g1rWM8oe8-WafMDgmT4" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&family=Instrument+Sans:wght@400..700&family=Instrument+Serif&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      // Para añadir el panel a la pantalla de inicio. En el iPhone es lo que
      // hace falta para recibir avisos con el teléfono bloqueado (R19).
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => installTelemetry(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ConnectionBanner />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Suspense fallback={null}>
          <Toaster position="top-center" />
        </Suspense>
      </I18nProvider>
    </QueryClientProvider>
  );
}
