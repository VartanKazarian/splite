import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Receipt } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { ApiError, guest, guestSession, menu, scannedQr } from "@/lib/api";
import { GuestError } from "@/components/GuestError";
import { GuestBillScreen } from "@/components/GuestBillScreen";
import { GuestMenuView } from "@/components/GuestMenuView";
import { FixedBottomBar, GuestOrderBar, GuestOrderSent } from "@/components/GuestOrderBar";
import { RestaurantHero } from "@/components/RestaurantHero";
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

  /**
   * Lo que el comensal lleva elegido de la carta.
   *
   * Vive aquí y no dentro de la carta porque la barra de enviar es hermana de
   * la carta, no hija: las dos necesitan lo mismo y ninguna es dueña de la
   * otra. Se vacía al enviar.
   */
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sent, setSent] = useState(false);
  const bumpCart = (productId: string, delta: number) =>
    setCart((prev) => ({ ...prev, [productId]: Math.max(0, (prev[productId] ?? 0) + delta) }));

  const contextQuery = useQuery({
    queryKey: ["qr-context", token],
    enabled: !demo && Boolean(token),
    retry: false,
    // El código está impreso: no caduca, y la respuesta sólo cambia cuando se
    // abre o se cierra una cuenta. Se refresca al volver a la pantalla.
    staleTime: 30_000,
    queryFn: () => guest.qrContext(token as string),
  });

  // La misma clave que usa la carta por dentro, así que esto no es otra
  // petición: react-query devuelve la que ya está en memoria. La barra necesita
  // los precios para decir cuánto lleva elegido.
  const menuQuery = useQuery({
    queryKey: ["public-menu", contextQuery.data?.restaurant.id],
    enabled: Boolean(contextQuery.data?.restaurant.id),
    retry: false,
    queryFn: () => menu.publicMenu(contextQuery.data!.restaurant.id),
  });
  const menuProducts = menuQuery.data?.products ?? [];

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
    const err = contextQuery.error instanceof ApiError ? contextQuery.error : undefined;
    const code = err?.code;
    // Un código rotado y una mesa que no existe responden lo mismo, a propósito.
    //
    // Y un código cortado también es un código que no vale. Un escaneo a
    // medias o un enlace copiado sin el final no llegan a comprobarse: la API
    // los rechaza antes, por la forma, con VALIDATION_FAILED sobre `qrToken`.
    // Eso caía en el error genérico -- «Algo falló» y «Reintentar» --, y
    // reintentar un código roto falla siempre: un bucle sin salida justo para
    // quien más necesita la de reescanear.
    const qrMalformed =
      code === "VALIDATION_FAILED" &&
      Array.isArray(err?.details["fieldPaths"]) &&
      (err.details["fieldPaths"] as unknown[]).includes("qrToken");
    if (code === "QR_INVALID" || code === "QR_TOKEN_INVALID" || qrMalformed) {
      return (
        <Shell>
          <h1 className="text-3xl">{t("qrInvalidTitle")}</h1>
          {/* Sin repetir el título. `qrInvalid` dice «Código no válido. Pide uno
              nuevo al personal.» y hace falta entero donde no hay titular que lo
              diga -- la pantalla de la cuenta --, pero aquí, debajo de «Código
              no válido», la primera mitad es la misma frase dos veces. */}
          <p className="mt-3 text-sm text-muted-foreground">{t("qrInvalidHelp")}</p>

          {/* Y una salida.
              Esta pantalla era un punto muerto: decía que el código no vale y
              ahí se acababa. Recargar tampoco servía -- el token se guarda en la
              pestaña, así que volvía a salir lo mismo --, y el comensal se
              quedaba con un aviso y un teléfono en la mano.

              Escanear no lo puede hacer esta pantalla; lo hace la cámara. Lo
              que sí puede hacer es tirar el código caducado y la sesión que
              colgaba de él, que es lo que deja el sitio listo para el código
              nuevo. Sin esto, apuntar otra vez con la cámara funcionaba igual,
              pero nada lo decía. */}
          <button
            type="button"
            onClick={() => {
              scannedQr.set(null);
              guestSession.set(null);
              setToken(null);
            }}
            className="btn-choice mt-5 w-full"
          >
            {t("qrRescan")}
          </button>
        </Shell>
      );
    }
    // El título también distingue. «Algo falló» encima de «no hemos podido
    // conectar» son dos frases para lo mismo y la primera es la que menos dice.
    return (
      <Shell>
        <h1 className="text-3xl">
          {contextQuery.error instanceof ApiError ? t("errorTitle") : t("errorOfflineTitle")}
        </h1>
        <GuestError error={contextQuery.error} onRetry={() => void contextQuery.refetch()} />
      </Shell>
    );
  }

  const context = contextQuery.data!;

  if (view === "menu") {
    return (
      <>
        <GuestMenuView
          restaurantId={context.restaurant.id}
          branding={context.restaurant}
          name={context.restaurant.name}
          above={t("theMenu")}
          cart={{ quantities: cart, bump: bumpCart }}
          back={
            <button
              onClick={() => go("landing")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {context.table.name}
            </button>
          }
        />

        {/* La confirmación ocupa el sitio de la barra, no una pantalla aparte:
            quien acaba de pedir suele querer seguir mirando la carta, y
            sacarlo de ella para decirle "hecho" es devolverlo al principio. */}
        {sent ? (
          <FixedBottomBar>
            <div className="mx-auto w-full max-w-md px-5 pb-5 pt-3">
              <GuestOrderSent onMenu={() => setSent(false)} onBill={openBill} />
            </div>
          </FixedBottomBar>
        ) : (
          <GuestOrderBar
            quantities={cart}
            products={menuProducts}
            qrToken={token}
            onSent={() => {
              setCart({});
              setSent(true);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16 pt-4">
      {/* Aquí no va nuestro nombre.
          Había una cabecera que ponía «Splite» y lo único que hacía era
          aparecer encima del nombre del restaurante: quien acaba de escanear el
          código de una mesa está en un local concreto, y lo primero que debe
          leer es dónde está sentado, no con qué se lo estamos enseñando.
          Ya no lleva a ningún sitio tampoco -- el enlace a la página comercial
          se quitó antes, por lo mismo --, así que era una línea que ocupaba el
          sitio de la portada del local. */}
      <RestaurantHero
        branding={context.restaurant}
        name={context.restaurant.name}
        above={context.table.name}
      />

      <div className="surface mt-6 p-6">
        <p className="text-center text-sm text-muted-foreground">{t("landingPrompt")}</p>

        <div className="mt-6 space-y-3">
          <Choice
            testId="guest-open-menu"
            icon={<BookOpen className="h-5 w-5" />}
            title={t("theMenu")}
            hint={t("theMenuHint")}
            onClick={() => go("menu")}
          />
          <Choice
            testId="guest-open-bill"
            icon={<Receipt className="h-5 w-5" />}
            title={t("yourBill")}
            // Lo único que dice del dinero: si hay cuenta abierta. Cuánto se debe
            // está detrás de la sesión, que aún no se ha abierto.
            hint={context.hasOpenBill ? t("yourBillHint") : t("noOpenBillYet")}
            onClick={openBill}
            disabled={opening}
          />
        </div>

        {openError ? <GuestError error={openError} onRetry={() => void openBill()} /> : null}
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
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * Ancla para las pruebas de humo. Es lo único de esta pantalla que no puede
   * cambiar de nombre: el texto del botón sí, y las pruebas afirman que se
   * llega al final, no cómo se llama cada paso.
   */
  testId?: string;
}) {
  return (
    <button
      {...(testId ? { "data-testid": testId } : {})}
      onClick={onClick}
      disabled={disabled}
      // La misma pieza que las cuatro formas de repartir: dos opciones entre
      // iguales, blancas y con trazo. Iban en gris relleno con un borde de
      // 1,23:1, y el gris de `secondary` contra el blanco de la tarjeta no
      // llega a 1,1:1 -- se leían como dos manchas, no como dos botones.
      className="flex w-full items-center gap-4 rounded-2xl border-[1.5px] border-border-strong bg-card px-4 py-4 text-left transition-colors hover:bg-secondary disabled:opacity-60"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="hint mt-0.5 block">{hint}</span>
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
