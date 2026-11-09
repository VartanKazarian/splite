import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { API_BASE_URL } from "./lib/api";
import { withSecurityHeaders } from "./lib/security-headers";
import { CSP_NONCE_HEADER, newCspNonce } from "./lib/csp-nonce";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Solo las páginas (GET/HEAD) llevan el nonce: el resto pasa tal cual, con su
// cuerpo intacto. Se construye desde la URL y no con new Request(request, …),
// que en Node falla con la petición envuelta del servidor.
function withNonceHeader(request: Request, nonce: string): Request {
  if (request.method !== "GET" && request.method !== "HEAD") return request;
  const headers = new Headers(request.headers);
  headers.set(CSP_NONCE_HEADER, nonce);
  return new Request(request.url, { method: request.method, headers, signal: request.signal });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      // Uno nuevo por petición. Viaja al router en una cabecera interna (una
      // que mandara el navegador se pisa aquí) y sale en la política.
      const nonce = newCspNonce();
      const response = await normalizeCatastrophicSsrResponse(
        await handler.fetch(withNonceHeader(request, nonce), env, ctx),
      );
      return import.meta.env.PROD ? withSecurityHeaders(response, API_BASE_URL, nonce) : response;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
