import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, formatMoney, orders, type GuestOrder } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lo que los comensales acaban de pedir desde su mesa.
 *
 * Las líneas ya están en su cuenta -- entran en el acto -- así que esto no
 * aprueba nada: es la forma de que alguien de la sala se entere de que la Mesa
 * 4 pidió, y de qué. Sin ella, seis líneas nuevas en una cuenta no se
 * distinguen de seis que tecleó un mesero hace media hora.
 *
 * Por eso el botón dice "Visto" y no "Aceptar". Aceptar sugiere que se puede
 * rechazar, y no se puede: el dinero ya está en la cuenta. Lo único que hace es
 * sacar el aviso de la bandeja y dejar escrito quién se hizo cargo.
 *
 * Desaparece entera cuando no hay nada. Una tarjeta permanente que dice "no hay
 * pedidos" es una casilla para un cero, y el panel ya tiene su sitio para lo
 * que hay que atender.
 */
export function OrderTray({ onOpenTable }: { onOpenTable?: (tableId: string) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const tray = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: () => orders.list(),
    retry: false,
    // Al ritmo del plano, no más rápido: un pedido que tarda ocho segundos en
    // aparecer sigue llegando antes de que nadie cruce el comedor.
    refetchInterval: 8000,
  });

  const ack = useMutation({
    mutationFn: (id: string) => orders.ack(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["service-snapshot"] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown")),
  });

  if (tray.isLoading) return <Skeleton className="h-24 w-full" />;
  if (tray.isError) return null;

  const list = tray.data ?? [];
  if (list.length === 0) return null;

  return (
    <section className="surface overflow-hidden" aria-labelledby="order-tray-heading">
      <h2
        id="order-tray-heading"
        className="flex items-center gap-2 border-b border-border px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground"
      >
        <UtensilsCrossed aria-hidden className="h-4 w-4" />
        {t("orderTray")}
      </h2>
      <ul className="divide-y divide-border">
        {list.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            pending={ack.isPending}
            onAck={() => ack.mutate(order.id)}
            {...(onOpenTable ? { onOpen: () => onOpenTable(order.tableId) } : {})}
          />
        ))}
      </ul>
    </section>
  );
}

function OrderRow({
  order,
  pending,
  onAck,
  onOpen,
}: {
  order: GuestOrder;
  pending: boolean;
  onAck: () => void;
  onOpen?: () => void;
}) {
  const { t } = useI18n();

  // Lo que se pidió y lo que queda. Coinciden casi siempre; cuando no, es que
  // un mesero ya quitó una línea, y decirlo evita que alguien vaya a la cocina
  // a por algo que ya nadie debe.
  const removed = order.lineCount - order.items.length;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="font-display text-lg underline-offset-4 hover:underline"
          >
            {order.tableName}
          </button>
        ) : (
          <span className="font-display text-lg">{order.tableName}</span>
        )}
        <span className="figure text-xs text-muted-foreground">{ago(order.ageSeconds, t)}</span>
      </div>

      <ul className="mt-1.5 space-y-0.5">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="figure">{item.quantity}</span> × {item.name}
            </span>
            <span className="money-sm shrink-0 text-muted-foreground">
              {formatMoney(item.subtotalMinor, "VES")}
            </span>
          </li>
        ))}
      </ul>

      {removed > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {removed === 1
            ? t("orderLineRemovedOne")
            : t("orderLineRemoved").replace("{n}", String(removed))}
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={onAck}
        className="mt-2.5 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
      >
        <Check aria-hidden className="h-4 w-4" /> {t("orderSeen")}
      </button>
    </li>
  );
}

/**
 * "hace 3 min".
 *
 * Sobre los segundos que manda el servidor y no sobre la marca de tiempo: el
 * reloj del navegador puede estar mal puesto, y con él un pedido de hace un
 * minuto se lee como de hace un día. La misma razón por la que la antigüedad de
 * una cuenta tampoco se calcula aquí.
 */
function ago(seconds: number | null, t: (key: "justNow" | "agoMin" | "agoHour") => string): string {
  if (seconds === null) return "—";
  if (seconds < 60) return t("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("agoMin").replace("{n}", String(minutes));
  return t("agoHour").replace("{n}", String(Math.floor(minutes / 60)));
}
