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
