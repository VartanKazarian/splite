import { push as pushApi } from "@/lib/api";

/**
 * Avisos en el teléfono del personal, con la pantalla bloqueada (R19).
 *
 * El panel ya sonaba con un pedido nuevo y contaba los pagos por verificar,
 * pero sólo con la pestaña abierta y la pantalla encendida. Esto suscribe el
 * navegador a Web Push: el servidor manda el aviso al servicio de push del
 * teléfono (Google, Apple, Mozilla) y el service worker (`public/sw.js`) lo
 * enseña aunque el panel esté cerrado.
 *
 * Qué recibe cada uno lo decide el servidor por rol: caja, los pagos; la sala,
 * los pedidos. Aquí sólo se enciende y se apaga, por teléfono.
 */

/** Recordado en este teléfono: que esta persona los encendió aquí. */
const FLAG = "splite.push";

export type PushSupport =
  /** Se puede. */
  | "ok"
  /** El navegador no tiene Web Push (o no es un navegador). */
  | "unsupported"
  /** iPhone o iPad en Safari: sólo llega a una web añadida a la pantalla de inicio. */
  | "ios-install";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-install";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return "ok";
}

export type PushStatus = "on" | "off" | "denied";

/** Cómo están en este teléfono ahora mismo. */
export async function pushStatus(): Promise<PushStatus> {
  if (pushSupport() !== "ok") return "off";
  if (Notification.permission === "denied") return "denied";
  const subscription = await currentSubscription();
  return subscription && remembered() ? "on" : "off";
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function remembered(): boolean {
  try {
    return localStorage.getItem(FLAG) === "on";
  } catch {
    return false;
  }
}

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "on");
    else localStorage.removeItem(FLAG);
  } catch {
    /* sin almacenamiento, el panel no se vuelve a suscribir solo; nada más */
  }
}

/** La clave del servidor, de base64url a los bytes que pide `subscribe`. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "===".slice((base64url.length + 3) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export class PushError extends Error {
  constructor(
    readonly reason: "unsupported" | "ios-install" | "denied" | "server-off",
    message = reason,
  ) {
    super(message);
  }
}

/**
 * Encenderlos en este teléfono. Pide permiso si hace falta (`prompt: false`
 * para no pedirlo nunca: lo que hace `resumePush`).
 */
export async function enablePush({ prompt = true } = {}): Promise<void> {
  const support = pushSupport();
  if (support !== "ok") throw new PushError(support);

  const config = await pushApi.config();
  if (!config.enabled || !config.publicKey) throw new PushError("server-off");

  let permission = Notification.permission;
  if (permission === "default" && prompt) permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushError("denied");

  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const key = keyBytes(config.publicKey);
  let subscription = await registration.pushManager.getSubscription();
  // Una suscripción hecha con otra clave no sirve: el servicio de push
  // rechazaría lo que firma este servidor.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });

  await pushApi.subscribe(subscription.toJSON());
  remember(true);
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === wanted.length && bytes.every((b, i) => b === wanted[i]);
}

/** Apagarlos en este teléfono: en el servidor y en el navegador. */
export async function disablePush(): Promise<void> {
  remember(false);
  if (pushSupport() !== "ok") return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}

/**
 * Al abrir el panel: si en este teléfono estaban encendidos, que lo sigan.
 *
 * El servidor borra las suscripciones de quien tuvo que volver a entrar
 * (baja, cambio de rol, contraseña nueva), y el servicio de push puede
 * cambiar la dirección sin avisar. Volver a mandarla es barato y deja todo
 * como estaba. Nunca pide permiso: eso sólo con el botón.
 */
export async function resumePush(): Promise<void> {
  if (!remembered() || pushSupport() !== "ok" || Notification.permission !== "granted") return;
  await enablePush({ prompt: false }).catch(() => undefined);
}
