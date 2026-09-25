import { Suspense, lazy, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

import { bs } from "./format";

/**
 * La demo del comensal, de verdad, dentro de la landing.
 *
 * No es una recreación: es `GuestBillScreen` en modo demo, el mismo componente
 * que ve quien escanea un QR. Esa era la condición para hacerlo -- una copia
 * enseñaría dentro de tres meses un producto que ya no existe -- y resulta que
 * se podía, porque el modo demo no toca el servidor: la cuenta y el reparto se
 * calculan en el cliente, el aviso de pago devuelve un PENDING de mentira y el
 * cobro C2P devuelve SUCCEEDED. No hay sesión, no hay token y **no hay ninguna
 * llamada que pueda fallar delante de un posible cliente**.
 *
 * **Se carga al pulsar, no al entrar.** Ese componente y lo que arrastra pesan
 * unos 44 KB, y ésta es la página que abre en el teléfono alguien que todavía
 * no sabe si le interesamos. Cargarla de entrada sería pagar el peso de la
 * demo en el primer pintado de todo el que no la va a usar. Con `lazy` sólo la
 * descarga quien la pide.
 *
 * El marco tiene alto fijo y su propio scroll: la cuenta del comensal es larga
 * y, sin techo, empujaría media página hacia abajo cada vez que alguien abre el
 * panel de pago.
 */
const GuestBillScreen = lazy(() =>
  import("@/components/GuestBillScreen").then((m) => ({ default: m.GuestBillScreen })),
);

/** Lo que se ve mientras llega el trozo de código. Del alto del marco, para que nada salte. */
function Loading() {
  return (
    <div className="flex h-[620px] items-center justify-center text-sm text-muted-foreground">
      Cargando la demo…
    </div>
  );
}

/** Las líneas de `demoBill()`, sin cargar la demo para pintarlas. Se ven las cuatro primeras: la quinta quedaba bajo el botón. */
const DEMO_LINES: [string, number, number][] = [
  ["Tequeños (6u)", 1, 8],
  ["Hamburguesa de la casa", 2, 15],
  ["Pabellón criollo", 1, 16],
  ["Cerveza artesanal", 3, 5],
  ["Papelón con limón", 2, 3],
];

export function TryDemo() {
  const [on, setOn] = useState(false);
  /*
   * Para volver a empezar.
   *
   * La demo termina en «Pago confirmado» y ahí se queda: sin esto, para
   * repetirla -- o para enseñársela a otra persona, que es lo que hace alguien
   * que está evaluando esto -- había que recargar la página entera. Cambiar la
   * `key` desmonta y vuelve a montar la pantalla, que es la forma barata de
   * devolverle todo su estado inicial sin que el componente tenga que saber
   * nada de esto.
   */
  const [run, setRun] = useState(0);

  return (
    /*
     * `min-w-0` no es decoración: los hijos de un flex o un grid traen
     * `min-width: auto`, así que el ancho mínimo del contenido de la cuenta
     * empujaba la celda y el marco se iba a 398 px dentro de una ventana de
     * 393 -- la landing entera se desplazaba de lado en el teléfono. Medido al
     * abrirse el reparto, que es cuando aparece la fila más ancha.
     *
     * Y `overflow-x-hidden` en el marco como red: recortar dos píxeles de una
     * demo es infinitamente mejor que una página de venta que se mueve en
     * horizontal bajo el pulgar.
     *
     * **El `-mx-5` en teléfono devuelve los 40 px del margen de la sección.**
     * Sin eso el marco daba 351 px donde la pantalla del comensal está hecha
     * para 390, y las filas del reparto salían con el precio cortado por la
     * mitad: se leía "$15,0". Es un marco de teléfono; que ocupe el ancho de un
     * teléfono es lo correcto, y el recorte era la prueba de que no lo hacía.
     */
    <div className="-mx-5 w-auto min-w-0 sm:mx-0 sm:w-full sm:max-w-[400px]">
      <div className="overflow-hidden rounded-[2rem] border border-border bg-background shadow-[0_30px_70px_-40px_rgba(20,20,20,0.55)]">
        {on ? (
          <div className="h-[620px] overflow-y-auto overflow-x-hidden overscroll-contain">
            <Suspense fallback={<Loading />}>
              <GuestBillScreen key={run} demo embedded autoplay />
            </Suspense>
          </div>
        ) : (
          /* El cartel de antes de pulsar.
             Encima de la cuenta que se va a ver, y no sobre un marco vacío: un
             teléfono en blanco de 620 px con un botón en medio se leía como
             algo que no había cargado. Las líneas son las de la cuenta de la
             demo, para que al pulsar aparezca lo que ya se estaba viendo. */
          <div className="relative h-[620px] overflow-hidden">
            <div aria-hidden className="px-5 pt-6 opacity-70">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Casa 72 · Mesa 12
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight">Tu cuenta</p>
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {DEMO_LINES.slice(0, 4).map(([name, qty, usd]) => (
                  <li key={name} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span className="truncate text-[14px]">
                      {qty > 1 && <span className="text-muted-foreground">{qty}× </span>}
                      {name}
                    </span>
                    <span className="figure text-[13px] text-muted-foreground">
                      {bs(usd * qty)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-[62%] flex-col items-center justify-end gap-4 bg-gradient-to-t from-background via-background to-background/0 px-8 pb-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12">
                <Play aria-hidden className="h-6 w-6 text-primary" />
              </span>
              <div>
                <p className="text-lg font-semibold">La cuenta de un comensal</p>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  La misma pantalla que ve quien escanea el QR. Se reparte sola una parte de la
                  cuenta, y puedes tomar el control cuando quieras.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOn(true)}
                className="min-h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Reproducir la demo
              </button>
              <p className="text-[12px] text-muted-foreground">
                Cuenta de ejemplo. No se cobra nada.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Que se puede interrumpir hay que decirlo: sin esto, una pantalla que
          se mueve sola se lee como un vídeo y nadie intenta tocarla. */}
      {on && (
        <p className="mt-3 text-center text-[12px] text-muted-foreground">
          Se reproduce sola · toca la pantalla para tomar el control
        </p>
      )}

      {on && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" /> Volver a empezar
          </button>
        </div>
      )}
    </div>
  );
}
