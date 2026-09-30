import type { Product } from "@/lib/api";

/**
 * El orden de la carta en el panel, el mismo que ve el comensal.
 *
 * Primero la sección (por su puesto; sin sección al final), después el puesto
 * del plato dentro de ella y el nombre sólo para desempatar. Antes el panel
 * ponía los activos delante y el resto por orden alfabético, así que lo que
 * veía el dueño no era la carta que veía el comensal.
 */
export function sortLikeMenu(products: Product[], sectionRank: Map<string, number>): Product[] {
  const rank = (p: Product) =>
    p.categoryId
      ? (sectionRank.get(p.categoryId) ?? Number.MAX_SAFE_INTEGER - 1)
      : Number.MAX_SAFE_INTEGER;
  return [...products].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.position ?? 0) - (b.position ?? 0) ||
      a.name.localeCompare(b.name, "es"),
  );
}

/**
 * La lista con un elemento movido un puesto arriba (-1) o abajo (+1).
 *
 * Devuelve la misma lista si el movimiento se sale por un extremo: la flecha
 * del primero hacia arriba no hace nada, y así se puede no pintarla sin que
 * un doble toque rompa el orden.
 */
export function moveBy<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}

/**
 * Los productos con los puestos que resultan de un orden nuevo en una sección.
 *
 * Es lo que se escribe en la caché antes de que conteste el servidor, para que
 * el plato se mueva al pulsar y no un segundo después. Los de otras secciones
 * no se tocan.
 */
export function withSectionOrder(products: Product[], orderedIds: string[]): Product[] {
  const position = new Map(orderedIds.map((id, i) => [id, i]));
  return products.map((p) => {
    const at = position.get(p.id);
    return at === undefined ? p : { ...p, position: at };
  });
}
