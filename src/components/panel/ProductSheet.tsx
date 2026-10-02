import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/ConfirmButton";
import { ProductPhoto } from "@/components/ProductPhoto";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ApiError,
  errorFields,
  exchangeRate,
  formatMinor,
  formatMoney,
  menu,
  parseMinorInput,
  type MenuCategory,
  type Product,
  type ProductTaxCategory,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { vesEquivalent } from "@/lib/menu-price";

const TAX_CATEGORIES: ProductTaxCategory[] = ["TAXABLE", "EXEMPT", "EXONERATED", "NON_TAXABLE"];

/**
 * Añadir o editar un plato, en una hoja.
 *
 * Antes eran dos formularios distintos dentro de la lista: uno arriba para
 * añadir y otro que se abría en la fila del plato para editarlo. Los dos sin
 * etiquetas -- el de editar ni siquiera tenía texto de ayuda, eran cuatro
 * cajas con el valor dentro --, y el de editar empujaba la lista hacia abajo
 * mientras se escribía. Ahora es uno solo, con cada campo nombrado, que sube
 * desde abajo en el teléfono y entra por la derecha en el ordenador, y la
 * lista se queda donde estaba.
 */
export function ProductSheet({
  open,
  onOpenChange,
  product,
  defaultCategoryId,
  categories,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null para uno nuevo. */
  product: Product | null;
  /** La sección que se está mirando: un plato nuevo suele ir ahí. */
  defaultCategoryId: string;
  categories: MenuCategory[];
  currency: string;
}) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  // Cada apertura empieza de cero: sin esto, cerrar a medio escribir y abrir
  // otro plato enseñaba lo que quedó del anterior.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((n) => n + 1);
  }, [open, product?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "max-h-[92vh] overflow-y-auto rounded-t-2xl pb-0"
            : "w-full overflow-y-auto pb-0 sm:max-w-md"
        }
      >
        <SheetHeader className="pr-10 text-left">
          <SheetTitle>
            {product ? t("productSheetEditTitle") : t("productSheetAddTitle")}
          </SheetTitle>
          <SheetDescription className={product ? "" : "sr-only"}>
            {product ? t("changesApplyToNewOrders") : t("productSheetAddTitle")}
          </SheetDescription>
        </SheetHeader>
        <ProductForm
          key={`${product?.id ?? "new"}-${session}`}
          product={product}
          defaultCategoryId={defaultCategoryId}
          categories={categories}
          currency={currency}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ProductForm({
  product,
  defaultCategoryId,
  categories,
  currency,
  onDone,
}: {
  product: Product | null;
  defaultCategoryId: string;
  categories: MenuCategory[];
  currency: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const ids = useId();
  const nameInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? formatMinor(product.priceMinorUnits) : "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    product ? (product.categoryId ?? "") : defaultCategoryId,
  );
  const [active, setActive] = useState(product?.active ?? true);
  const [taxCategory, setTaxCategory] = useState<ProductTaxCategory>(
    product?.taxCategory ?? "TAXABLE",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Con la opción rara puesta, el pliegue sale abierto: esconder que un plato
  // va exento es la manera de que nadie lo vuelva a mirar.
  const [moreOpen, setMoreOpen] = useState((product?.taxCategory ?? "TAXABLE") !== "TAXABLE");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["menu-products"] });
    queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
    queryClient.invalidateQueries({ queryKey: ["public-menu"] });
  };

  const fail = (error: unknown) => {
    setErrors(errorFields(error));
    if (!(error instanceof ApiError)) toast.error(t("apiDown"));
    else if (error.code === "PRODUCT_NAME_TAKEN") toast.error(t("nameTaken"));
    else toast.error(error.message);
  };

  const body = () => ({
    name: name.trim(),
    priceMinorUnits: parseMinorInput(price),
    description: description.trim() ? description.trim() : null,
    // Explícitamente null al vaciarlo: sacar un plato de su sección es algo
    // que se hace a propósito, y no es lo mismo que no mencionarla.
    categoryId: categoryId || null,
    active,
    taxCategory,
  });

  const save = useMutation({
    mutationFn: (andAnother: boolean) =>
      (product ? menu.updateProduct(product.id, body()) : menu.createProduct(body())).then(
        (saved) => ({ saved, andAnother }),
      ),
    onSuccess: ({ saved, andAnother }) => {
      refresh();
      setErrors({});
      if (andAnother) {
        // Se queda la sección, la disponibilidad y el IVA: quien carga una
        // carta a mano la carga sección por sección.
        toast.success(t("productAddedNamed").replace("{name}", saved.name));
        setName("");
        setPrice("");
        setDescription("");
        nameInput.current?.focus();
        return;
      }
      toast.success(product ? t("saved") : t("productAddedNamed").replace("{name}", saved.name));
      onDone();
    },
    onError: fail,
  });

  const remove = useMutation({
    // Borra de verdad. Para quitarlo de la carta sin perderlo está el
    // interruptor de «Disponible», justo encima.
    mutationFn: () => menu.deleteProduct(product!.id, true),
    onSuccess: () => {
      refresh();
      toast.success(t("productDeleted"));
      onDone();
    },
    onError: fail,
  });

  // Lo que es ese precio en bolívares hoy, mientras se escribe. La carta en
  // dólares la paga el comensal en bolívares, y quien pone el precio quiere
  // saber cómo se va a leer en la mesa.
  const fx = useQuery({
    queryKey: ["fx"],
    queryFn: exchangeRate,
    retry: false,
    staleTime: 5 * 60_000,
    enabled: currency === "USD" || currency === "EUR",
  });
  const todayRate = fx.data?.rates[currency];
  let priceVes: string | null = null;
  try {
    priceVes = price.trim() ? vesEquivalent(parseMinorInput(price), todayRate) : null;
  } catch {
    priceVes = null;
  }

  const canSave = Boolean(name.trim() && price.trim()) && !save.isPending;
  const field =
    "w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring";
  const label = "block text-sm font-medium";
  const error = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-destructive">{errors[key]}</p> : null;

  return (
    <form
      className="mt-5 flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save.mutate(false);
      }}
    >
      <div className="space-y-5">
        <div>
          <label htmlFor={`${ids}-name`} className={label}>
            {t("fieldName")}
          </label>
          <input
            ref={nameInput}
            id={`${ids}-name`}
            value={name}
            maxLength={160}
            autoFocus={!product}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            className={`mt-1.5 ${field}`}
          />
          {error("name")}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-x-3">
          <label htmlFor={`${ids}-price`} className={`${label} col-span-2`}>
            {t("fieldPrice")}
          </label>
          <input
            id={`${ids}-price`}
            value={price}
            inputMode="decimal"
            autoComplete="off"
            placeholder="1.250,50"
            onChange={(e) => setPrice(e.target.value)}
            aria-describedby={`${ids}-price-hint`}
            className={`mt-1.5 figure ${field}`}
          />
          <span className="mt-1.5 self-center text-sm text-muted-foreground">{currency}</span>
          <p id={`${ids}-price-hint`} className="col-span-2 mt-1 text-xs text-muted-foreground">
            {priceVes
              ? t("priceVesPreview").replace("{amount}", formatMoney(priceVes, "VES"))
              : t("priceInputHint")}
          </p>
          <div className="col-span-2">{error("priceMinorUnits")}</div>
        </div>

        <div>
          <label htmlFor={`${ids}-section`} className={label}>
            {t("sectionLabel")}
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-input bg-secondary px-4 focus-within:border-ring">
            <Tag aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
            <select
              id={`${ids}-section`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="min-h-11 w-full bg-transparent text-sm outline-none"
            >
              <option value="">{t("uncategorised")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : ` (${t("sectionHiddenSuffix")})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${ids}-description`} className={label}>
              {t("fieldDescription")}
            </label>
            <span className="text-xs text-muted-foreground figure">{description.length}/500</span>
          </div>
          <textarea
            id={`${ids}-description`}
            value={description}
            maxLength={500}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby={`${ids}-description-hint`}
            className={`mt-1.5 resize-none ${field}`}
          />
          <p id={`${ids}-description-hint`} className="mt-1 text-xs text-muted-foreground">
            {t("fieldDescriptionHint")}
          </p>
          {error("description")}
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
          <div className="min-w-0">
            <label htmlFor={`${ids}-active`} className={label}>
              {t("fieldAvailable")}
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("fieldAvailableHint")}</p>
          </div>
          <Switch
            id={`${ids}-active`}
            checked={active}
            onCheckedChange={setActive}
            className="mt-0.5"
          />
        </div>

        {product ? (
          <ProductPhoto product={product} />
        ) : (
          <p className="text-xs text-muted-foreground">{t("photoAfterSave")}</p>
        )}

        <details
          open={moreOpen}
          onToggle={(e) => setMoreOpen(e.currentTarget.open)}
          className="group rounded-xl border border-border"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm">
            <span>
              {t("moreOptions")}
              <span className="text-muted-foreground">
                {" "}
                · {t("fieldTax")}: {t(`tax${taxCategory}`)}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <fieldset className="px-4 pb-4">
            <legend className="sr-only">{t("fieldTax")}</legend>
            <div className="grid gap-1">
              {TAX_CATEGORIES.map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                >
                  <input
                    type="radio"
                    name={`${ids}-tax`}
                    value={value}
                    checked={taxCategory === value}
                    onChange={() => setTaxCategory(value)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  {t(`tax${value}`)}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("taxHint")}</p>
            {error("taxCategory")}
          </fieldset>
        </details>

        {product && (
          <div className="border-t border-border pt-4">
            <ConfirmButton
              title={t("confirmDeleteProduct")}
              description={t("confirmDeleteProductBody")}
              confirmLabel={t("confirmDeleteProductCta")}
              onConfirm={() => remove.mutate()}
              disabled={remove.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm text-destructive hover:underline disabled:opacity-40"
            >
              <Trash2 aria-hidden className="h-4 w-4" /> {t("deleteProduct")}
            </ConfirmButton>
          </div>
        )}
      </div>

      {/* Guardar siempre a la vista, también con el teclado del teléfono
          abierto y la descripción a medio escribir. */}
      <div className="sticky bottom-0 -mx-6 mt-6 flex flex-col gap-2 border-t border-border bg-background px-6 py-4 sm:flex-row-reverse">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {product ? t("save") : t("addProduct")}
        </button>
        {product ? (
          <button
            type="button"
            onClick={onDone}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-border px-5 text-sm"
          >
            {t("cancel")}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSave}
            onClick={() => save.mutate(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-border px-5 text-sm disabled:opacity-40"
          >
            {t("saveAndAddAnother")}
          </button>
        )}
      </div>
    </form>
  );
}
