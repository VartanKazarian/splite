/*
 * El service worker del panel: sólo avisos (R19).
 *
 * No cachea nada a propósito. Un service worker que cachea la aplicación es
 * una versión vieja del panel que sigue sirviéndose después de publicar, y eso
 * en una caja que cobra es peor que no tener modo sin conexión. Éste sólo
 * enseña los avisos que manda el servidor y abre el panel al tocarlos.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Splite";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      // El mismo aviso actualizado sustituye al anterior en vez de apilarse.
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: typeof data.tag === "string",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      lang: "es",
      data: { url: typeof data.url === "string" ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Sólo dentro de esta web, aunque el aviso dijera otra cosa.
  let target = new URL("/", self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.url || "/", self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {
    /* se queda en el inicio */
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
