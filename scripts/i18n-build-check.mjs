/**
 * ¿Llegan los textos a la compilación? Corre después de `vite build`, en CI.
 *
 * Pasó en producción: `package.json` decía `"sideEffects": false`, la
 * compilación quitó las importaciones sueltas de las partes del diccionario
 * (`import "@/lib/i18n-staff"`) y el panel y la mesa enseñaban las claves
 * -- «settingsTitle», «menuTitle» -- en vez del texto. En desarrollo y en las
 * pruebas no se veía: sólo se rompe al compilar.
 *
 * Comprueba dos cosas:
 * 1. Que cada parte está, en el navegador y en el servidor (un texto de muestra
 *    de cada una aparece en algún archivo compilado).
 * 2. Que ninguna parte va en el código de arranque, que descargan todas las
 *    páginas: cada una debe cargarse sólo con las páginas que la usan.
 *
 *   node scripts/i18n-build-check.mjs
 */
import fs from "node:fs";
import path from "node:path";

const out = ".output";
const PARTS = ["guest", "staff", "public"];

/** Unos textos en español de la parte, tal cual están en el archivo. */
function samples(part) {
  const source = fs.readFileSync(`src/lib/i18n-${part}.ts`, "utf8");
  const es = source.slice(source.indexOf("es: {"), source.indexOf("en: {"));
  return [...es.matchAll(/^\s+[A-Za-z0-9_]+: "([^"\\{}]{12,60})",$/gm)]
    .map((m) => m[1])
    .slice(0, 5);
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return files(full);
    return /\.(m?js)$/.test(e.name) ? [full] : [];
  });
}

const contents = (dir) => files(dir).map((f) => fs.readFileSync(f, "utf8"));
const client = contents(path.join(out, "public"));
const server = contents(path.join(out, "server"));

const problems = [];
for (const part of PARTS) {
  const texts = samples(part);
  if (texts.length < 3) problems.push(`i18n-${part}: no encuentro textos de muestra`);
  for (const text of texts) {
    if (!client.some((c) => c.includes(text)))
      problems.push(`i18n-${part} falta en el navegador: «${text}»`);
    if (!server.some((c) => c.includes(text)))
      problems.push(`i18n-${part} falta en el servidor: «${text}»`);
  }
}

const manifestFile = fs
  .readdirSync(path.join(out, "server"))
  .find((f) => f.startsWith("_tanstack-start-manifest"));
if (!manifestFile) throw new Error("No hay manifiesto: ¿se hizo el build?");
const mod = await import(path.resolve(out, "server", manifestFile));
const root = (mod.tsrStartManifest ?? Object.values(mod)[0])().routes.__root__;
const rootJs = [
  ...(root?.assets ?? []).map((a) => a.attrs?.src ?? a.attrs?.href),
  ...(root?.preloads ?? []),
].filter((f) => typeof f === "string");
for (const file of rootJs) {
  const name = path.basename(file);
  if (/^i18n-(guest|staff|public)-/.test(name))
    problems.push(`${name} va en el arranque: lo descargarían todas las páginas`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("\nLos textos de la aplicación no llegan bien a la compilación.");
  process.exit(1);
}
console.log(`Diccionario completo en la compilación (${PARTS.join(", ")}); nada en el arranque.`);
