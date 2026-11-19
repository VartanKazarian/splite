/**
 * El idioma guardado en este navegador, sin romper si no se puede leer.
 *
 * `localStorage` lanza en algunos navegadores con los datos bloqueados (modos
 * privados, navegadores dentro de otras apps). Antes eso tumbaba la página
 * entera por un detalle: el idioma. Lo usan también las páginas de error, que
 * se pintan fuera de este proveedor.
 */
export function storedLang(): "es" | "en" | null {
  try {
    const stored = window.localStorage.getItem("mesa-lang");
    return stored === "en" || stored === "es" ? stored : null;
  } catch {
    return null;
  }
}

/**
 * El idioma del teléfono, para quien no ha elegido ninguno.
 *
 * Español si cualquiera de los idiomas del navegador lo es -- un venezolano con
 * el teléfono en inglés y español de segundo idioma lee la mesa en español --;
 * inglés en cualquier otro caso: un turista con el teléfono en alemán entiende
 * antes el inglés que el español.
 */
export function browserLang(): "es" | "en" {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return langs.some((l) => l?.toLowerCase().startsWith("es")) ? "es" : "en";
  } catch {
    return "es";
  }
}
