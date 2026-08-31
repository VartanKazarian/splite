import { useQuery } from "@tanstack/react-query";

import { useI18n } from "@/lib/i18n";
import { formatMoney, menu, type PublicMenu, type PublicProduct } from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";

/**
 * La carta, tal y como la lee un comensal sentado en la mesa.
 *
 * Sin sesión y sin login: el endpoint público sólo necesita el id del
 * restaurante, que la pantalla anterior ya resolvió a partir del QR.
 *
 * Las secciones se pintan en el orden que trae el backend (`position`, el orden
 * impreso), no en el que aparezcan los productos. Los productos sin sección van
 * al final, agrupados aparte: son los que todavía no se han archivado, y
 * repartirlos por la lista los esconde.
 */
export function PublicMenuScreen({ restaurantId }: { restaurantId: string }) {
  const { t } = useI18n();

  const menuQuery = useQuery({
    queryKey: ["public-menu", restaurantId],
    retry: false,
    queryFn: () => menu.publicMenu(restaurantId),
  });

  if (menuQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (menuQuery.isError) {
    return <ErrorBox error={menuQuery.error} fallback={t("apiDown")} />;
  }

  const data = menuQuery.data as PublicMenu;
  const groups = groupBySection(data);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("menuEmpty")}</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.id ?? "__none__"}>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            {group.name ?? t("menuOther")}
          </h2>
          <ul className="mt-3 space-y-3 border-t border-border pt-3">
            {group.products.map((product) => (
              <li key={product.id} className="flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm">{product.name}</p>
                  {product.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{product.description}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatMoney(product.priceMinorUnits, product.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Section = { id: string | null; name: string | null; products: PublicProduct[] };

/**
 * Agrupa los productos por sección respetando el orden de `categories`.
 *
 * Se recorre la lista de secciones en vez de la de productos: así una sección
 * queda en su sitio aunque el backend devuelva sus productos en otro bloque, y
 * una sección vacía simplemente no se pinta en lugar de aparecer donde no toca.
 */
function groupBySection(data: PublicMenu): Section[] {
  const byCategory = new Map<string, PublicProduct[]>();
  const uncategorised: PublicProduct[] = [];
  for (const product of data.products ?? []) {
    if (!product.categoryId) {
      uncategorised.push(product);
      continue;
    }
    const bucket = byCategory.get(product.categoryId);
    if (bucket) bucket.push(product);
    else byCategory.set(product.categoryId, [product]);
  }

  const sections: Section[] = [];
  for (const category of data.categories ?? []) {
    const products = byCategory.get(category.id);
    if (products?.length) sections.push({ id: category.id, name: category.name, products });
  }
  if (uncategorised.length) sections.push({ id: null, name: null, products: uncategorised });
  return sections;
}
