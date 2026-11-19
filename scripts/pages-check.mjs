/**
 * Recorre la compilación de producción en un navegador y busca claves sin
 * traducir («settingsTitle», «menuTitle»…) en lo que se ve.
 *
 * Existe por un fallo que llegó a producción: la compilación quitó los textos
 * y el panel, el acceso y la mesa enseñaban claves. Las pruebas de humo no lo
 * vieron porque corren contra el servidor de desarrollo, donde no pasa. Esto
 * mira lo mismo que se publica.
 *
 * - La API es de mentira: «quién soy» contesta un dueño y lo demás 404. Las
 *   pantallas del panel se ven en su estado de error o vacío, que también es
 *   texto que tiene que estar traducido.
 * - La mesa se recorre en modo demo (`/t?demo=1`), que no llama a la API: la
 *   cuenta, los tres modos de dividir, la propina, los métodos de pago y un
 *   cobro C2P de ejemplo.
 * - Todo en español y en inglés.
 *
 * Después de `vite build`:
 *
 *   node scripts/pages-check.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "@playwright/test";

const PORT = 4329;
const BASE = `http://127.0.0.1:${PORT}`;

/** Todas las claves del diccionario con alguna mayúscula: las que no son palabras normales. */
const KEYS = new Set(
  [
    "src/lib/i18n.tsx",
    "src/lib/i18n-guest.ts",
    "src/lib/i18n-staff.ts",
    "src/lib/i18n-public.ts",
    "src/lib/i18n-errors.ts",
  ]
    .flatMap((file) => [
      ...fs.readFileSync(file, "utf8").matchAll(/^ {4}([A-Za-z][A-Za-z0-9_]*):/gm),
    ])
    .map((m) => m[1])
    .filter((key) => /[a-z][A-Z]/.test(key)),
);

const OWNER = {
  id: "u1",
  email: "dueno@example.com",
  role: "OWNER",
  restaurantId: "r1",
  displayName: "Ana",
};

const PUBLIC_PAGES = [
  "/",
  "/registro",
  "/tpv-hosteleria",
  "/login",
  "/olvide",
  "/restablecer?token=x",
];
const STAFF_PAGES = ["/dashboard", "/mesas", "/menu", "/pagos", "/settings", "/preview"];

/** El texto de una clave de la mesa en un idioma, sacado del propio diccionario. */
const guestSource = fs.readFileSync("src/lib/i18n-guest.ts", "utf8");
function labelOf(lang, key) {
  const half =
    lang === "es" ? guestSource.split(/^ {2}en: \{/m)[0] : guestSource.split(/^ {2}en: \{/m)[1];
  const value = new RegExp(`^ {4}${key}: "([^"]+)"`, "m").exec(half ?? "")?.[1];
  if (!value) throw new Error(`No encuentro ${key} (${lang}) en i18n-guest.ts`);
  return value;
}

/** Pasos en la mesa de demo: claves de los botones a pulsar, desde la cuenta. */
const GUEST_WALKS = [
  [],
  ["splitTheBill"],
  ["splitTheBill", "splitTabEven"],
  ["splitTheBill", "splitTabCustom"],
  ["payTheBill"],
  ["payTheBill", "stepContinue"],
  ["payTheBill", "stepContinue", "payTabC2P"],
  ["payTheBill", "stepContinue", "payTabPaid"],
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function rawKeysIn(text) {
  return [...new Set(text.split(/[^A-Za-z0-9_]+/).filter((word) => KEYS.has(word)))];
}

async function visibleText(page) {
  return page.evaluate(() => {
    const attrs = [...document.querySelectorAll("[aria-label],[placeholder],[title],[alt]")].map(
      (el) =>
        ["aria-label", "placeholder", "title", "alt"]
          .map((a) => el.getAttribute(a) ?? "")
          .join(" "),
    );
    return `${document.title} ${document.body.innerText} ${attrs.join(" ")}`;
  });
}

const server = spawn("bun", ["scripts/serve-build.mjs", String(PORT)], { stdio: "inherit" });
const stop = () => server.kill();
process.on("exit", stop);

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/login`)).ok) break;
  } catch {
    /* todavía no */
  }
  if (i > 60) throw new Error("La compilación no llegó a servirse");
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const problems = [];
let checked = 0;

async function visit(lang, label, { path, staff = false, walk = [] }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(
    ({ lang, staff, owner }) => {
      try {
        localStorage.setItem("mesa-lang", lang);
        if (staff)
          localStorage.setItem(
            "splite.staff.session",
            JSON.stringify({ accessToken: "x", expiresIn: 3600, user: owner }),
          );
      } catch {
        /* nada */
      }
    },
    { lang, staff, owner: OWNER },
  );
  const page = await context.newPage();
  await page.route(/\/api\/v1\//, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/v1/auth/me") return route.fulfill({ json: { user: OWNER } });
    return route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "x", details: {}, requestId: "t" } },
    });
  });
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    for (const step of walk) {
      const name = labelOf(lang, step);
      await page
        .getByRole("button", { name: step === "payTabC2P" ? name : new RegExp(escape(name)) })
        .first()
        .click({ timeout: 5000 });
      await page.waitForTimeout(300);
    }
    if (walk.at(-1) === "payTabC2P") {
      await page.fill("#c2p-id", "12345678");
      await page.fill("#c2p-phone", "04141234567");
      await page.fill("#c2p-clave", "123456");
      await page.getByRole("button", { name: /C2P/ }).last().click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(300);
    const raw = rawKeysIn(await visibleText(page));
    if (raw.length) problems.push(`[${lang}] ${label}: ${raw.join(", ")}`);
  } catch (err) {
    problems.push(`[${lang}] ${label}: no se pudo recorrer (${err.message.split("\n")[0]})`);
  }
  checked++;
  await context.close();
}

for (const lang of ["es", "en"]) {
  for (const path of PUBLIC_PAGES) await visit(lang, path, { path });
  for (const path of STAFF_PAGES) await visit(lang, path, { path, staff: true });
  await visit(lang, "/t (sin QR)", { path: "/t" });
  for (const walk of GUEST_WALKS) {
    await visit(lang, `/t demo ${walk.join(" → ") || "cuenta"}`, {
      path: "/t?demo=1",
      walk,
    });
  }
}

await browser.close();
stop();

if (problems.length) {
  console.error(`\nClaves sin traducir en la compilación (${KEYS.size} claves buscadas):`);
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${checked} pantallas en español e inglés, sin claves sin traducir.`);
