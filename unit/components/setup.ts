/**
 * Un DOM para las pruebas de componentes (R15).
 *
 * happy-dom y no un navegador: estas pruebas miran lo que el comensal ve y lo
 * que pasa cuando toca, no cómo se pinta. Lo que depende del navegador de
 * verdad -- CSP, hidratación, tamaños -- lo cubren las de humo en Playwright.
 *
 * Se carga antes que nada (`bunfig.toml`): Testing Library ata `screen` al
 * `document` que encuentra al importarse. Las pruebas que miran el render en
 * servidor quitan `window` ellas mismas (`withoutWindow`).
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://splite.lat/" });

/** Corre `fn` como en el servidor, sin `window`, y lo deja como estaba. */
export function withoutWindow<T>(fn: () => T): T {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  // @ts-expect-error -- quitarlo es justo la prueba
  delete globalThis.window;
  try {
    return fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, "window", saved);
  }
}
