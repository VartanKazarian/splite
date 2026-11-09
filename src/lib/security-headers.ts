/**
 * Las cabeceras de seguridad de cada página que sirve el servidor.
 *
 * **Por qué importa aquí.** La sesión del personal -- con su token de
 * renovación -- vive en el almacenamiento del navegador (web y API están en
 * dominios sin relación, y Safari no manda cookies de terceros). Un script
 * inyectado podría leerla y mandarla fuera. Dos defensas:
 *
 * - **Que no corra.** `script-src` sólo deja los scripts que llevan el nonce
 *   de esta petición, que el router pone en los suyos (src/lib/csp-nonce.ts),
 *   y lo que esos carguen ('strict-dynamic'). Ni scripts en línea sin nonce,
 *   ni de cualquier sitio https. 'self' y https: quedan sólo para navegadores
 *   sin CSP 3, que ignoran 'strict-dynamic'; los demás los descartan.
 * - **Que no salga.** `connect-src` sólo deja hablar con la propia web y con
 *   la API de Splite, y las imágenes sólo cargan de ahí mismo o de datos
 *   incrustados: un token robado no tiene a dónde viajar por `fetch`, un
 *   `<img>` o un formulario.
 *
 * `frame-ancestors` evita que otra web meta el panel en un marco invisible para
 * que alguien pulse «Confirmar: el dinero llegó» sin saberlo. Se deja a
 * Lovable, cuyo editor enseña la vista previa en un marco.
 *
 * Sólo en producción: en desarrollo Vite recarga por WebSocket y mete estilos
 * y scripts propios, y una política que los bloquee sólo estorba.
 */
export function securityHeaders(apiBaseUrl: string, nonce?: string): Record<string, string> {
  let api = "";
  try {
    api = new URL(apiBaseUrl).origin;
  } catch {
    api = "";
  }
  const csp = [
    "default-src 'self'",
    // Sin nonce (no debería pasar en producción) se queda en la política
    // anterior antes que romper la página.
    nonce
      ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' https:`
      : "script-src 'self' 'unsafe-inline' https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${api}`.trim(),
    "media-src 'self' blob:",
    `connect-src 'self' ${api}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    // La ruta completa sólo a la propia web; a otras, sólo el origen. La
    // página de la mesa, que lleva el QR en la dirección, pide además
    // no-referrer con su propia etiqueta.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    // Nada del panel usa la cámara, el micrófono ni la ubicación. La foto de
    // la carta entra como archivo, no con la cámara del navegador.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

/** Añade las cabeceras a una respuesta HTML; el resto sale como vino. */
export function withSecurityHeaders(
  response: Response,
  apiBaseUrl: string,
  nonce?: string,
): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(apiBaseUrl, nonce))) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
