import { Suspense, lazy, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

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
    <div className="w-full max-w-[400px]">
      <div className="overflow-hidden rounded-[2rem] border border-border bg-background shadow-[0_30px_70px_-40px_rgba(20,20,20,0.55)]">
        {on ? (
          <div className="h-[620px] overflow-y-auto overscroll-contain">
            <Suspense fallback={<Loading />}>
              <GuestBillScreen key={run} demo embedded />
            </Suspense>
          </div>
        ) : (
          /* El cartel de antes de pulsar. Dice qué se puede hacer, porque una
             demo que no promete nada concreto no se pulsa. */
          <div className="flex h-[620px] flex-col items-center justify-center gap-5 px-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12">
              <Play aria-hidden className="h-6 w-6 text-primary" />
            </span>
            <div>
              <p className="text-lg font-semibold">La cuenta de un comensal</p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                La misma pantalla que ve quien escanea el QR. Divide la cuenta, deja propina y llega
                hasta el cobro.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOn(true)}
              className="min-h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Probar la demo
            </button>
            <p className="text-[12px] text-muted-foreground">
              Cuenta de ejemplo. No se cobra nada.
            </p>
          </div>
        )}
      </div>

      {on && (
        <div className="mt-3 flex justify-center">
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
