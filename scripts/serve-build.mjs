/**
 * Sirve la compilación de producción (`.output/`) en local, para probarla.
 *
 * La compilación es un worker de Cloudflare: se le pasan las peticiones de
 * página y los archivos de `public/` se sirven tal cual, como en producción.
 * Corre con Bun (importa el worker directamente):
 *
 *   bun scripts/serve-build.mjs [puerto]
 */
import path from "node:path";

const out = path.resolve(".output");
const port = Number(process.argv[2] ?? 4321);
const worker = (await import(path.join(out, "server", "index.mjs"))).default;

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname !== "/" && !pathname.endsWith("/")) {
      const file = Bun.file(path.join(out, "public", decodeURIComponent(pathname)));
      if (await file.exists()) return new Response(file);
    }
    return worker.fetch(
      request,
      { ASSETS: { fetch: () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
  },
});
console.log(`Compilación en http://127.0.0.1:${port}`);
