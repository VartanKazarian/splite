/**
 * Un servidor de mentira para las pantallas de comensal.
 *
 * Cada prueba dice qué contesta cada ruta y luego mira qué se le pidió. Lo que
 * no está previsto contesta 404, así que una petición nueva que nadie esperaba
 * se nota en vez de colarse.
 */
import { guestSession } from "../../src/lib/api";

export type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };
type Reply =
  { status: number; body?: unknown } | ((call: Call) => { status: number; body?: unknown });

export function stubApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const call: Call = {
      method,
      path: url.pathname,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}`];
    const reply = typeof route === "function" ? route(call) : route;
    if (!reply)
      return json(404, { error: { code: "NOT_FOUND", message: "sin ruta", details: {} } });
    return reply.status === 204
      ? new Response(null, { status: 204 })
      : json(reply.status, reply.body);
  }) as typeof fetch;
  return {
    calls,
    to: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body ?? null), {
    status,
    headers: { "content-type": "application/json" },
  });

export const apiError = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, requestId: "test" } },
});

/** Un comensal que ya escaneó el QR. */
export function signInGuest() {
  guestSession.set({
    sessionId: "sess-1",
    guestToken: "guest-token",
    restaurantId: "rest-1",
    tableId: "table-1",
    expiresIn: 3600,
  });
}
