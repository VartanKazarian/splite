import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * El nonce de la política de scripts de esta petición.
 *
 * Lo genera src/server.ts para cada página, lo pone en la cabecera
 * Content-Security-Policy y lo pasa aquí por una cabecera interna de la
 * petición, para que el router lo ponga en sus propios scripts (hidratación y
 * módulos). Un script inyectado no lo conoce, y no corre.
 *
 * En el navegador no hace falta: los scripts que crean los ya autorizados
 * heredan el permiso ('strict-dynamic').
 */
export const CSP_NONCE_HEADER = "x-splite-csp-nonce";

export const cspNonce = createIsomorphicFn()
  .server(() => getRequestHeader(CSP_NONCE_HEADER) ?? undefined)
  .client(() => undefined);

/** 16 bytes aleatorios en base64: lo que pide la especificación de CSP. */
export function newCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}
