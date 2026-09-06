import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { orders } from "@/lib/api";

/**
 * El aviso sonoro de que ha entrado un pedido.
 *
 * **Sintetizado y no un archivo.** Dos motivos: no hay que servir ni cachear
 * nada -- el sonido pesa cero bytes de red y suena igual con mala cobertura,
 * que es la que hay en media sala --, y el timbre se ajusta escribiendo dos
 * números en vez de volviendo a grabar. Dos notas cortas, un intervalo
 * ascendente: se reconoce sin ser una alarma. En un comedor con música y gente,
 * lo que hace falta es que se distinga, no que asuste.
 *
 * **Los navegadores no dejan sonar sin permiso.** El audio está bloqueado hasta
 * que la persona ha tocado la página, y ese bloqueo es correcto: nadie quiere
 * que una pestaña abierta de fondo empiece a pitar. En el panel el bloqueo se
 * levanta solo -- para llegar aquí hay que iniciar sesión, que ya son varios
 * toques -- pero puede fallar igual, y entonces `play` no hace nada y no rompe
 * nada. Un aviso que no suena es un aviso perdido; una excepción sin capturar
 * en un intervalo de sondeo se lleva por delante la pantalla entera.
 *
 * El contexto se crea a la primera llamada y se reutiliza. Crear uno por
 * sonido agota la cuota del navegador en una tarde de servicio.
 */

type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

/** Una nota: seno puro con una envolvente que evita el chasquido al cortar. */
function note(ctx: AudioContext, hertz: number, startsAt: number, seconds: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = hertz;

  // Sin la rampa, empezar y parar un oscilador de golpe suena a "clic": el
  // salto instantáneo de amplitud tiene su propio contenido en frecuencia.
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(0.18, startsAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + seconds);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + seconds);
}

/**
 * Suena el aviso. Silencioso si el navegador no deja: nunca lanza.
 *
 * Devuelve si llegó a sonar, que es lo que permite a quien llama enseñar el
 * interruptor en su estado real en vez de prometer un sonido que no sale.
 */
export function chime(): boolean {
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    // Suspendido es lo normal cuando el navegador todavía no ha visto un gesto,
    // y también después de que el sistema duerma la pestaña.
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    note(ctx, 880, now, 0.16);
    note(ctx, 1318.5, now + 0.13, 0.22);
    return true;
  } catch {
    return false;
  }
}

const KEY = "splite-order-chime";

/**
 * Si el aviso suena, recordado en este navegador.
 *
 * Por dispositivo y no por cuenta: quién quiere sonido depende del aparato --
 * el móvil del mesero sí, el portátil de la oficina no -- y no de quién ha
 * iniciado sesión. Encendido por defecto: un aviso que hay que descubrir para
 * activarlo no avisa a nadie.
 */
export const chimeEnabled = {
  get(): boolean {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(KEY) !== "off";
    } catch {
      // Modo privado, o almacenamiento bloqueado. No poder recordar la
      // preferencia no es motivo para quedarse en silencio.
      return true;
    }
  },
  set(on: boolean) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* la sesión seguirá con lo elegido, sólo que no sobrevive a recargar */
    }
  },
};

/**
 * Avisa cuando entra un pedido que no estaba, esté donde esté quien mira.
 *
 * Vive en la cabecera del panel y no en la bandeja porque la bandeja sólo está
 * en el panel de inicio, y un mesero trabaja desde Mesas: un aviso que sólo
 * suena en una pantalla no avisa en las otras cuatro.
 *
 * Comparte clave de consulta con la bandeja, así que esto no es un sondeo más:
 * react-query hace uno y las dos leen de él.
 *
 * **Sobre los identificadores y no sobre el número.** Si entra uno y se da otro
 * por visto entre dos sondeos, el total no se mueve y aun así ha llegado algo.
 *
 * **La primera respuesta no suena.** Al abrir el panel puede haber pedidos de
 * hace media hora, y saludar con un timbre por cada uno enseña a la gente a
 * ignorarlo, que es la única forma de estropear un aviso sonoro.
 */
export function useOrderChime(enabled: boolean) {
  const tray = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: () => orders.list(),
    enabled,
    retry: false,
    refetchInterval: 8000,
  });

  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!tray.data) return;
    const ids = new Set(tray.data.map((o) => o.id));
    const first = known.current === null;
    const arrived = first ? false : tray.data.some((o) => !known.current!.has(o.id));
    known.current = ids;
    if (arrived && chimeEnabled.get()) chime();
  }, [tray.data]);
}
