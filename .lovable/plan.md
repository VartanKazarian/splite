# Apply uploaded `menu.tsx` update

## What the uploaded file does

The zip contains a single file, `src/routes/menu.tsx` (744 lines), which replaces the current menu screen (371→744 lines). It keeps all existing behavior (CRUD, OCR import, status filters, currency display) and adds **menu categories**:

- **Category assignment per product** — new `CategoryInput` component (text field with autocomplete suggestions) in the add-product form and in the inline edit row, using the existing `Tag`/`ChevronDown` icons and current design tokens.
- **Category storage in `localStorage`** — a `useCategories()` hook persists a `productId → category` map under `splite.menu.categories`. This is frontend-only because the backend has **no category field or endpoint** (confirmed gap in the OpenAPI contract), so nothing is sent to the API.
- **Category filter pills** — below the search/status filters; "Todas las categorías" plus one pill per existing category.
- **Grouped product list** — visible products grouped under category headings, "Sin categoría" always last; sorting by category, then active, then name.
- **Cleanup** — deleting a product removes its category entry.
- Minor layout polish: tighter paddings, two-column create form (description + category).

## Steps

1. Copy `/tmp/menu_updated/src/routes/menu.tsx` over `src/routes/menu.tsx` (no `.git` metadata in the zip — verified).
2. Typecheck with `bunx tsgo --noEmit`.
3. Fix any type errors (e.g. if `menu.createProduct` onSuccess payload isn't the created `Product`, or the `CategoryInput` subcomponent needs adjustment).
4. Quick preview check of `/menu` to confirm the screen renders and category assign/filter works.

## Note

Categories will be **per-browser** (localStorage), not synced across devices — an inherent limitation until the backend adds category support. This matches the uploaded implementation; no API changes needed.
