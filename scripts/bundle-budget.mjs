/**
 * Cuánto JavaScript descarga cada página antes de pintarse, comprimido.
 *
 * Corre después de `vite build`, en CI. Lee el manifiesto de TanStack Start
 * (qué archivos precarga cada ruta), comprime cada uno y suma. Falla si una
 * página se pasa de su presupuesto: la del QR es la que abre un comensal con
 * 3G y un Android barato, y llegó a 230 KB antes de la revisión del frontend.
 *
 *   node scripts/bundle-budget.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const KB = 1024;
const BUDGETS = {
  __root__: 140 * KB,
  "/t/": 160 * KB,
  "/t/$": 160 * KB,
  "/recibo/$token": 160 * KB,
  "/": 170 * KB,
  "/dashboard": 240 * KB,
};

const out = ".output";
const manifestFile = fs
  .readdirSync(path.join(out, "server"))
  .find((f) => f.startsWith("_tanstack-start-manifest"));
if (!manifestFile) throw new Error("No hay manifiesto: ¿se hizo el build?");
const mod = await import(path.resolve(out, "server", manifestFile));
const routes = (mod.tsrStartManifest ?? Object.values(mod)[0])().routes;

const gz = (file) =>
  zlib.gzipSync(fs.readFileSync(path.join(out, "public", file)), { level: 9 }).length;
const jsOf = (route) =>
  [
    ...(route?.assets ?? []).map((a) => a.attrs?.src ?? a.attrs?.href),
    ...(route?.preloads ?? []),
  ].filter((f) => typeof f === "string" && f.endsWith(".js"));

const rootFiles = new Set(jsOf(routes.__root__));
const rootSize = [...rootFiles].reduce((sum, f) => sum + gz(f), 0);

let failed = false;
const rows = [];
for (const [id, budget] of Object.entries(BUDGETS)) {
  const route = routes[id];
  if (!route) continue;
  const own =
    id === "__root__"
      ? 0
      : jsOf(route)
          .filter((f) => !rootFiles.has(f))
          .reduce((s, f) => s + gz(f), 0);
  const total = rootSize + own;
  const ok = total <= budget;
  failed ||= !ok;
  rows.push(
    `${ok ? "ok  " : "OVER"} ${id.padEnd(16)} ${(total / KB).toFixed(1).padStart(6)} KB / ${budget / KB} KB`,
  );
}
console.log(rows.join("\n"));
if (failed) {
  console.error(
    "\nUna página se pasa de su presupuesto de JavaScript (scripts/bundle-budget.mjs).",
  );
  process.exit(1);
}
