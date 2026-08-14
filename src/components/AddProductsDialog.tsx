import { useMemo, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { formatMinor, type Product } from "@/lib/api";

export function AddProductsDialog({
  open,
  onOpenChange,
  products,
  billCurrency,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  billCurrency: string;
  pending: boolean;
  onConfirm: (lines: { productId: string; quantity: number }[]) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => p.active)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [products, query]);

  const selected = Object.entries(qty).filter(([, n]) => n > 0);
  const bump = (id: string, delta: number) =>
    setQty((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));

  const close = (v: boolean) => {
    if (!v) {
      setQuery("");
      setQty({});
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("chooseProducts")}</DialogTitle>
          <DialogDescription>{t("addLines")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchProduct")}
            className="w-full rounded-lg border border-input bg-secondary py-2.5 pl-9 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>

        <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
          {list.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">{t("noResults")}</li>
          )}
          {list.map((p) => {
            const mismatch = p.currency !== billCurrency;
            const n = qty[p.id] ?? 0;
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                  n > 0 ? "border-primary/60 bg-secondary/60" : "border-border"
                } ${mismatch ? "opacity-40" : ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.currency} {formatMinor(p.priceMinorUnits)}
                    {mismatch ? ` · ${t("currencyMismatch")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={mismatch || n === 0}
                    onClick={() => bump(p.id, -1)}
                    aria-label={t("remove")}
                    className="rounded-full border border-border p-1.5 disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center tabular-nums">{n}</span>
                  <button
                    type="button"
                    disabled={mismatch}
                    onClick={() => bump(p.id, 1)}
                    aria-label={t("addToBill")}
                    className="rounded-full border border-border p-1.5 disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.reduce((a, [, n]) => a + n, 0)} {t("selectedCount")}
          </span>
          <button
            disabled={pending || selected.length === 0}
            onClick={() =>
              onConfirm(selected.map(([productId, quantity]) => ({ productId, quantity })))
            }
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> {t("addSelected")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
