/**
 * La dirección pública de Splite, en un solo sitio.
 *
 * Estaba escrita a mano como `https://splite.lovable.app` en el canónico, el
 * sitemap, `robots.txt` y la imagen para compartir. Esa dirección redirige a
 * splite.lat, así que se le decía a Google que la página de verdad vivía en un
 * dominio que la manda a otro sitio.
 */
export const SITE_URL = "https://splite.lat";

/**
 * Las únicas páginas que un buscador debe guardar. Lo demás -- el panel, la
 * consola, la mesa, el recibo, los enlaces de correo -- sale con
 * `X-Robots-Tag: noindex` (ver `robotsTag`).
 *
 * Una lista de lo público y no de lo privado a propósito: una página nueva
 * nace privada, y para que aparezca en Google hay que ponerla aquí, que es
 * también lo que la mete en el sitemap.
 */
export const INDEXABLE_PAGES: {
  path: string;
  changefreq: "weekly" | "monthly" | "yearly";
  priority: string;
}[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/registro", changefreq: "monthly", priority: "0.8" },
  { path: "/tpv-hosteleria", changefreq: "monthly", priority: "0.8" },
  { path: "/login", changefreq: "yearly", priority: "0.3" },
];

/**
 * La cabecera para buscadores de una página, o nada si es pública.
 *
 * Va en la cabecera y no sólo en una etiqueta de la página: así cubre también
 * las que no tienen `head()` propio (las redirecciones, como `/tasas`) y las
 * que alguien añada mañana. Tampoco se bloquean en `robots.txt`: un buscador
 * que no puede entrar no ve el `noindex`, y una dirección enlazada desde fuera
 * acabaría en el índice sin contenido.
 */
export function robotsTag(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return INDEXABLE_PAGES.some((page) => page.path === path) ? null : "noindex, nofollow";
}
