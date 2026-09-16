import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, HandPlatter, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth, bills, formatMoney, orders, type GuestOrder } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { canAssignServer } from "@/components/BillServerPicker";

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
 * **Y el otro botón, "Lo atiendo yo".** Una cuenta que abrió el comensal
 * pidiendo por el QR no tiene mesero -- no la abrió nadie de la casa -- y sus
 * propinas acaban en el cubo "sin mesero" del informe. Éste es el único momento
 * en que alguien de la sala mira esa mesa sabiendo quién va a atenderla, así
 * que es donde se pregunta. Da el pedido por visto y se pone la cuenta a su
 * nombre en un solo gesto, porque son la misma decisión.
 *
 * Sale sólo cuando de verdad falta: con la cuenta ya atribuida, el único botón
 * es "Visto". Nadie le quita una mesa a nadie desde aquí -- el servidor sólo
 * admite reclamar lo que no es de nadie, y sólo para uno mismo.
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

  // Quién está mirando, para poder ponerse una mesa a su nombre. Misma clave
  // que el resto del panel: una consulta, no una más.
  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });

  // El servidor sólo deja cambiar el mesero de una cuenta a dueño y encargado
  // (PATCH /bills/{id}/server). A un mesero el botón sólo le daría un error, y
  // encima dejaría el pedido sin dar por visto: mejor no ofrecérselo.
  const canAssign = canAssignServer(me.data?.user.role);

  const settled = () => {
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["service-snapshot"] });
  };

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown"));

  // El sonido no está aquí: lo lleva la cabecera del panel, que está en todas
  // las pantallas. Ver `useOrderChime`. Las dos comparten la misma consulta.
  const ack = useMutation({
    mutationFn: (id: string) => orders.ack(id),
    onSuccess: settled,
    onError: fail,
  });

  /**
   * Ponerse la mesa y dar el pedido por visto, en ese orden.
   *
   * Primero la atribución: si falla -- porque otro se adelantó por dos
   * segundos --, el aviso se queda en la bandeja y se ve el motivo, en vez de
   * desaparecer dejando la cuenta sin dueño igual que estaba.
   */
  const claim = useMutation({
    mutationFn: async ({ orderId, billId }: { orderId: string; billId: string }) => {
      await bills.setServer(billId, me.data!.user.id);
      await orders.ack(orderId);
    },
    onSuccess: () => {
      toast.success(t("orderMineDone"));
      settled();
      // La mesa cambia de dueño, así que el plano y esa cuenta se recargan.
      void queryClient.invalidateQueries({ queryKey: ["floor"] });
      void queryClient.invalidateQueries({ queryKey: ["bills", "OPEN"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "BILL_ALREADY_SERVED") {
        settled();
        return toast.error(t("orderMineTaken"));
      }
      return fail(error);
    },
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
            pending={ack.isPending || claim.isPending}
            onAck={() => ack.mutate(order.id)}
            {...(order.servedBy === null && order.billId && canAssign
              ? { onMine: () => claim.mutate({ orderId: order.id, billId: order.billId! }) }
              : {})}
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
  onMine,
  onOpen,
}: {
  order: GuestOrder;
  pending: boolean;
  onAck: () => void;
  /** Ausente cuando la cuenta ya tiene mesero, que es cuando no hay nada que pedir. */
  onMine?: () => void;
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

      {/* "Lo atiendo yo" primero y en verde cuando la mesa no es de nadie: es
          lo que hay que hacer, y "Visto" queda como la salida para quien sólo
          está mirando la bandeja desde la caja. Con mesero ya puesto, "Visto"
          vuelve a ser el único botón y recupera su sitio. */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {onMine && (
          <button
            type="button"
            disabled={pending}
            onClick={onMine}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <HandPlatter aria-hidden className="h-4 w-4" /> {t("orderMine")}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onAck}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <Check aria-hidden className="h-4 w-4" /> {t("orderSeen")}
        </button>
      </div>
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
