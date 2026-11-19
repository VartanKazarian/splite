import { useEffect, useRef, useState } from "react";

import { guest, guestSession, type Bill, type SplitMode } from "@/lib/api";
import { scrollBoxOf, scrollFrameTo } from "@/components/guest-bill/helpers";

/**
 * La sesión de invitado de esta pantalla.
 *
 * El QR trae un token firmado: se canjea una sola vez por sesión de invitado.
 */
export function useGuestBillSession({ qr, demo }: { qr: string | undefined; demo: boolean }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<unknown>(null);

  useEffect(() => {
    if (demo) {
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const clean = () => {
        if (!qr || typeof window === "undefined") return;
        // El token no debe quedar en la barra de direcciones ni en capturas.
        const url = new URL(window.location.href);
        url.searchParams.delete("qr");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      };
      try {
        // Cualquier móvil, sin login: el token del QR siempre abre sesión nueva
        // (una sesión vieja en sessionStorage podría ser de otra mesa o estar caducada).
        if (qr) {
          guestSession.set(null);
          await guest.openSession(qr);
        }
        clean();
        if (!cancelled) setSessionReady(Boolean(guestSession.get()));
      } catch (error) {
        clean();
        if (!cancelled) setSessionError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qr, demo]);

  return { sessionReady, sessionError };
}

/**
 * El pago, en tres actos.
 *
 * Todo esto vivía en un solo scroll: la cuenta, el reparto, la propina y el
 * formulario del banco, siempre dibujados. El comensal que bajaba a mirar su
 * cuenta se encontraba un selector de banco y una casilla de clave **antes de
 * haber decidido qué le tocaba pagar**, y la propina se pedía a media
 * pantalla, antes de que nadie se hubiera comprometido a nada.
 *
 * Ahora cada decisión tiene su pantalla y la cifra viaja abajo, anclada:
 *
 *   1. qué pagas   2. propina   3. cómo pagas
 *
 * Se guarda en `sessionStorage` a propósito. La clave de C2P se pide al banco
 * por SMS: el comensal sale del navegador, abre los mensajes y vuelve -- y si
 * al volver la pestaña se ha recargado, sin esto aparecería en el paso 1 con
 * la clave ya caducada en la mano.
 */
export function usePayStep(demo: boolean) {
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (demo) return 1;
    try {
      const saved = Number(sessionStorage.getItem("splite:paystep"));
      return saved === 2 || saved === 3 ? saved : 1;
    } catch {
      return 1;
    }
  });
  useEffect(() => {
    if (demo) return;
    try {
      sessionStorage.setItem("splite:paystep", String(step));
    } catch {
      /* Modo privado o almacenamiento bloqueado: el paso simplemente no
         sobrevive a una recarga, que es como estaba antes. */
    }
  }, [step, demo]);
  return [step, setStep] as const;
}

/**
 * El guion de la demo automática.
 *
 * Mueve el estado de esta pantalla, no clics simulados sobre sus botones:
 * disparar eventos del DOM desde fuera ata la demo a los textos y a la
 * disposición de los controles, y se rompe en silencio la primera vez que
 * alguien renombra un botón. Aquí, si un paso deja de existir, no compila.
 *
 * Las líneas salen de `bill.items` y no de ids escritos a mano, por lo mismo:
 * la cuenta de ejemplo puede cambiar y esto sigue señalando a dos platos.
 *
 * El reparto no hay que pedirlo: el efecto de la pantalla recalcula la parte
 * sola en cuanto cambian `mode` o `mine`. El guion sólo toca lo que tocaría un
 * dedo.
 */
export function useBillAutoplay({
  autoplay,
  demo,
  bill,
  setSplitOpen,
  setMode,
  setMine,
  setStep,
  setTipPct,
}: {
  autoplay: boolean;
  demo: boolean;
  bill: Bill | null;
  setSplitOpen: (open: boolean) => void;
  setMode: (mode: SplitMode) => void;
  setMine: (mine: Record<string, number>) => void;
  setStep: (step: 1 | 2 | 3) => void;
  setTipPct: (pct: number | null) => void;
}) {
  const autoplayRef = useRef<HTMLDivElement>(null);
  const splitPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoplay || !demo || !bill) return;
    const items = bill.items ?? [];
    // Un plato de varias unidades y otro también, para que se vea que se
    // reparten unidades y no líneas enteras.
    const first = items.find((i) => i.quantity >= 2);
    const second = items.find((i) => i !== first && i.quantity >= 2);
    if (!first || !second) return;
    const mineFinal = { [first.id]: 1, [second.id]: 2 };

    // Quien pidió que nada se mueva recibe el final, no el recorrido.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSplitOpen(true);
      setMode("ITEMS");
      setMine(mineFinal);
      return;
    }
    // El guion también avanza de paso: desde que la propina vive en el paso 2,
    // ponerla sin cambiar de pantalla dejaba el último tiempo de la demo
    // ocurriendo donde nadie lo ve.

    const steps: [number, () => void][] = [
      [
        700,
        () => {
          setSplitOpen(true);
          setMode("ITEMS");
        },
      ],
      // Bajar el marco hasta donde está pasando la cosa. Sin esto el reparto
      // ocurre por debajo del borde y la demo parece que no hace nada.
      [900, () => scrollFrameTo(splitPanelRef.current)],
      [2500, () => setMine({ [first.id]: 1 })],
      [3400, () => setMine(mineFinal)],
      [4600, () => setStep(2)],
      [5300, () => setTipPct(15)],
    ];
    const timers = steps.map(([at, run]) => setTimeout(run, at));

    /*
     * Cualquier gesto lo detiene donde esté.
     *
     * Es la diferencia con un vídeo, y no puede quedar a medias: si el guion
     * siguiera corriendo bajo el dedo, cambiaría la selección que la persona
     * acaba de hacer y parecería que la pantalla va por su cuenta.
     */
    const stop = () => timers.forEach(clearTimeout);
    /*
     * Los oyentes van en el marco, no en esta pantalla.
     *
     * Los eventos suben, no bajan: colgados aquí dentro, un toque en el borde
     * del marco no los alcanzaba. Y sobre todo **la rueda tampoco**, así que
     * quien desplazase el marco a mano se encontraba al guion desplazándolo de
     * vuelta -- medido: el recorrido llegaba hasta el final peleando con el
     * ratón. `wheel` y `touchmove` son gestos de una persona; `scroll` no vale,
     * porque lo dispara el propio guion al bajar el marco y se cancelaría solo.
     */
    const el = scrollBoxOf(autoplayRef.current) ?? autoplayRef.current;
    const events = ["pointerdown", "keydown", "wheel", "touchmove"] as const;
    events.forEach((e) => el?.addEventListener(e, stop, { passive: true }));
    return () => {
      timers.forEach(clearTimeout);
      events.forEach((e) => el?.removeEventListener(e, stop));
    };
    // Los setters de useState no cambian; como antes, sólo estos tres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, demo, bill]);

  return { autoplayRef, splitPanelRef };
}
