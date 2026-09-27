import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

import { orders } from "@/lib/api";

/**
 * El aviso sonoro de que ha entrado un pedido.
 *
 * **Sintetizado y no un archivo.** Dos motivos: no hay que servir ni cachear
 * nada -- el sonido pesa cero bytes de red y suena igual con mala cobertura,
 * que es la que hay en media sala --, y el timbre se ajusta escribiendo tres
 * números en vez de volviendo a grabar. Un arpegio corto ascendente: se
 * reconoce sin ser una alarma.
 *
 * **Los navegadores no dejan sonar sin un toque.** El audio está bloqueado
 * hasta que la persona toca la página, y en iPhone/iPad (Safari) el desbloqueo
 * tiene que ocurrir *dentro* del toque: que alguien haya tocado antes no basta.
 * La primera versión creaba el contexto de audio cuando llegaba el pedido, que
 * es justo el momento en que nadie está tocando nada, así que en iOS no sonaba
 * nunca, y en Chrome tampoco si el panel se abría con la sesión ya guardada.
 * Ahora:
 *
 *  - el primer toque en cualquier parte del panel desbloquea el audio
 *    (`installAudioUnlock`), y se vuelve a intentar al volver a la pestaña;
 *  - si aun así está bloqueado, `audioStatus` lo dice y la cabecera enseña
 *    «Toca para activar el sonido» en vez de callarse: un aviso que no suena
 *    y no lo dice es un aviso perdido;
 *  - en Safari se pide la sesión de audio de reproducción, para que el
 *    interruptor de silencio del iPhone/iPad no se trague el aviso. Quien no
 *    lo quiera tiene «Sonido silenciado» en el menú, por aparato.
 *
 * Nunca lanza: una excepción sin capturar en un intervalo de sondeo se lleva
 * por delante la pantalla entera.
 *
 * El contexto se crea una vez y se reutiliza. Crear uno por sonido agota la
 * cuota del navegador en una tarde de servicio.
 */

type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };
type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };

// ---------------------------------------------------------------------------
// Estado del audio, observable desde React.

export type AudioStatus = "unknown" | "running" | "blocked" | "unsupported";

let status: AudioStatus = "unknown";
const listeners = new Set<() => void>();

function setStatus(next: AudioStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

export function useAudioStatus(): AudioStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => "unknown",
  );
}

// ---------------------------------------------------------------------------
// El contexto de audio.

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
  if (!Ctor) {
    setStatus("unsupported");
    return null;
  }
  try {
    // Safari 16.4+: que suene aunque el iPhone/iPad esté en silencio. Tiene
    // que fijarse antes de que el contexto empiece a sonar.
    const nav = navigator as NavigatorWithAudioSession;
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* navegadores sin la API, o que no dejan cambiarla: no pasa nada */
  }
  try {
    context = new Ctor();
    context.addEventListener("statechange", syncStatus);
    syncStatus();
    return context;
  } catch {
    setStatus("unsupported");
    return null;
  }
}

function syncStatus() {
  if (!context) return;
  // iOS usa además "interrupted" (una llamada, otra app con audio).
  setStatus(context.state === "running" ? "running" : "blocked");
}

/**
 * Desbloquear el audio. Hay que llamarlo desde un toque para que valga en iOS.
 *
 * Además de `resume`, se reproduce un búfer vacío: es lo que en las versiones
 * de Safari más tercas convierte el toque en permiso de verdad.
 */
export function unlockAudio(): void {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state !== "running") void ctx.resume().then(syncStatus, syncStatus);
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    /* sin audio no se rompe nada */
  }
  syncStatus();
}

/**
 * Escuchar el primer toque (y los siguientes, mientras siga bloqueado).
 *
 * En fase de captura, para que ningún `stopPropagation` de un botón del panel
 * se lo coma. Al volver a la pestaña se reintenta: iOS suspende el audio de
 * las pestañas que pasan a segundo plano.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const onGesture = () => {
    if (status !== "running") unlockAudio();
  };
  const onVisible = () => {
    if (document.visibilityState !== "visible" || !context) return;
    if (context.state !== "running") void context.resume().then(syncStatus, syncStatus);
  };
  events.forEach((e) => window.addEventListener(e, onGesture, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", onVisible);
  // Crear el contexto ya, sin sonar: así se sabe desde el principio si el
  // navegador lo tiene bloqueado y la cabecera puede decirlo antes de que
  // llegue el primer pedido, no después.
  audioContext();
  return () => {
    events.forEach((e) => window.removeEventListener(e, onGesture, { capture: true }));
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Una nota: triangular (se oye mejor que un seno puro en el altavoz de un
 * teléfono o una tableta) más un poco de octava, con una envolvente que evita
 * el chasquido al cortar.
 */
function note(ctx: AudioContext, hertz: number, startsAt: number, seconds: number, peak: number) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(peak, startsAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + seconds);
  gain.connect(ctx.destination);

  for (const [type, mult, level] of [
    ["triangle", 1, 1],
    ["sine", 2, 0.35],
  ] as const) {
    const oscillator = ctx.createOscillator();
    const partial = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hertz * mult;
    partial.gain.value = level;
    oscillator.connect(partial).connect(gain);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + seconds);
  }
}

/**
 * Suena el aviso. Silencioso si el navegador no deja: nunca lanza.
 *
 * Devuelve si llegó a sonar, que es lo que permite a quien llama enseñar el
 * estado real en vez de prometer un sonido que no sale.
 */
export function chime(): boolean {
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "running") {
      play(ctx);
      return true;
    }
    // Suspendido. Fuera de un toque, `resume` sólo prospera si el navegador ya
    // dio permiso (Chrome, después de cualquier toque en la página); si no,
    // se queda esperando y la cabecera pide el toque. Cuando llegue, suena el
    // aviso que estaba pendiente -- uno solo, no uno por pedido acumulado.
    if (!queued) {
      queued = true;
      void ctx.resume().then(
        () => {
          queued = false;
          syncStatus();
          if (ctx.state === "running") play(ctx);
        },
        () => {
          queued = false;
          syncStatus();
        },
      );
    }
    syncStatus();
    return false;
  } catch {
    return false;
  }
}

let queued = false;

function play(ctx: AudioContext) {
  const now = ctx.currentTime;
  note(ctx, 880, now, 0.18, 0.3);
  note(ctx, 1108.7, now + 0.12, 0.18, 0.3);
  note(ctx, 1318.5, now + 0.24, 0.32, 0.34);
}

// ---------------------------------------------------------------------------
// Preferencias por aparato.

/**
 * Un interruptor recordado en este navegador, observable desde React.
 *
 * Por dispositivo y no por cuenta: quién quiere sonido depende del aparato --
 * el móvil del mesero sí, el portátil de la oficina no -- y no de quién ha
 * iniciado sesión.
 */
function deviceSwitch(key: string, fallback: boolean) {
  const subs = new Set<() => void>();
  const read = (): boolean => {
    if (typeof window === "undefined") return fallback;
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v === "on";
    } catch {
      // Modo privado, o almacenamiento bloqueado.
      return fallback;
    }
  };
  let memory: boolean | null = null;
  return {
    get: (): boolean => memory ?? read(),
    set(on: boolean) {
      memory = on;
      try {
        window.localStorage.setItem(key, on ? "on" : "off");
      } catch {
        /* la sesión seguirá con lo elegido, sólo que no sobrevive a recargar */
      }
      subs.forEach((l) => l());
    },
    subscribe(l: () => void) {
      subs.add(l);
      return () => subs.delete(l);
    },
    fallback,
  };
}

/** Si el aviso suena. Encendido por defecto: un aviso que hay que descubrir no avisa. */
export const chimeEnabled = deviceSwitch("splite-order-chime", true);

/**
 * Modo tableta: para el aparato que se queda fijo en la barra o la cocina.
 * Mantiene la pantalla encendida y repite el aviso hasta que alguien abre el
 * pedido. Apagado por defecto: en el teléfono de un mesero, la pantalla
 * siempre encendida se come la batería y un pitido cada veinte segundos en el
 * bolsillo es un castigo.
 */
export const tabletMode = deviceSwitch("splite-tablet-mode", false);

export function useDeviceSwitch(s: typeof chimeEnabled): boolean {
  return useSyncExternalStore(s.subscribe, s.get, () => s.fallback);
}

// ---------------------------------------------------------------------------
// Pantalla encendida.

type WakeLockSentinelLike = { release(): Promise<void>; released?: boolean };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/**
 * Mantener la pantalla encendida mientras `active`.
 *
 * El navegador suelta el bloqueo cada vez que la pestaña deja de verse, así
 * que se vuelve a pedir al volver.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const nav = navigator as NavigatorWithWakeLock;
    if (!active || !nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const s = await nav.wakeLock!.request("screen");
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        /* batería baja, o el navegador no deja: la pantalla hará lo de siempre */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

// ---------------------------------------------------------------------------
// El sondeo.

/** Cada cuánto se repite el aviso en modo tableta, y durante cuánto como mucho. */
const REPEAT_EVERY_MS = 20_000;
const REPEAT_FOR_MS = 10 * 60_000;

/**
 * Avisa cuando entra un pedido que no estaba, esté donde esté quien mira.
 *
 * Vive en la cabecera del panel y no en la bandeja porque la bandeja sólo está
 * en el panel de inicio, y un mesero trabaja desde Mesas.
 *
 * Comparte clave de consulta con la bandeja, así que esto no es un sondeo más:
 * react-query hace uno y las dos leen de él. Sigue sondeando con la pestaña en
 * segundo plano -- en un portátil con otra ventana delante, o una tableta en
 * pantalla dividida, el aviso es justo lo que hace falta --; el navegador
 * espacia los intervalos de las pestañas ocultas, pero no los para.
 *
 * **Sobre los identificadores y no sobre el número.** Si entra uno y se da otro
 * por visto entre dos sondeos, el total no se mueve y aun así ha llegado algo.
 *
 * **La primera respuesta no suena.** Al abrir el panel puede haber pedidos de
 * hace media hora, y saludar con un timbre por cada uno enseña a la gente a
 * ignorarlo.
 *
 * **En modo tableta se repite** cada veinte segundos mientras algún pedido
 * llegado con el panel abierto siga sin abrirse, durante diez minutos como
 * mucho: lo bastante para que alguien lo oiga, sin pitar toda la noche por un
 * pedido que ya se atendió sin marcarlo.
 */
export function useOrderChime(enabled: boolean) {
  const repeat = useDeviceSwitch(tabletMode);
  const tray = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: () => orders.list(),
    enabled,
    retry: false,
    refetchInterval: 8000,
    refetchIntervalInBackground: true,
  });

  const known = useRef<Set<string> | null>(null);
  // Pedidos que llegaron con el panel abierto y siguen sin abrirse: id -> hora.
  const waiting = useRef(new Map<string, number>());

  useEffect(() => installAudioUnlock(), []);

  useEffect(() => {
    if (!tray.data) return;
    const ids = new Set(tray.data.map((o) => o.id));
    const first = known.current === null;
    const fresh = first ? [] : tray.data.filter((o) => !known.current!.has(o.id));
    known.current = ids;
    const now = Date.now();
    fresh.forEach((o) => waiting.current.set(o.id, now));
    for (const id of waiting.current.keys()) if (!ids.has(id)) waiting.current.delete(id);
    if (fresh.length && chimeEnabled.get()) chime();
  }, [tray.data]);

  useEffect(() => {
    if (!repeat) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const [id, at] of waiting.current) {
        if (now - at > REPEAT_FOR_MS) waiting.current.delete(id);
      }
      const due = [...waiting.current.values()].some((at) => now - at >= REPEAT_EVERY_MS);
      if (due && chimeEnabled.get()) chime();
    }, REPEAT_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [repeat]);
}
