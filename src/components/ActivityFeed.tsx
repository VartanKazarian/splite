import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { formatMoney, payments, type ActivityEntry } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/**
 * Los dos tipos que devuelve el servidor.
 *
 * Sacados del enum del contrato, no inventados: la primera versión de esto
 * traducía nombres plausibles (`PAYMENT_SUCCEEDED` y compañía) que el servidor
 * no emite, así que todas las entradas habrían salido con su código en crudo.
 */
/**
 * Los nombres salen del diccionario, no de aquí.
 *
 * Esto era un segundo juego de traducciones, privado de este componente y
 * escrito a mano en español: no cambiaba con el selector de idioma, discrepaba
 * en mayúsculas con el resto de la aplicación ("Efectivo" en caja, "efectivo"
 * aquí) y no tenía entrada para SPLITE, así que esa fila enseñaba el enum en
 * crudo -- "Cobro · Mesa 4 · splite".
 */
const KIND_KEY: Record<string, "feedSettled" | "feedDeclared"> = {
  SETTLED: "feedSettled",
  DECLARED: "feedDeclared",
};

/** Hora local, que es como se lee un turno. */
function at(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Lo que ha ido pasando en el turno.
 *
 * El endpoint existía y no lo llamaba nadie, así que para saber si acababa de
 * entrar un cobro había que mirar mesa por mesa. Es un listado del servidor: no
 * se deriva de los otros, que traen estado actual y no historia.
 */
export function ActivityFeed() {
  const { t } = useI18n();
  const feed = useQuery({
    queryKey: ["payments-activity"],
    queryFn: () => payments.activity(undefined, 20),
    retry: false,
    refetchInterval: 30000,
  });

  const rows: ActivityEntry[] = feed.data?.data ?? [];

  return (
    <section className="surface p-5">
      <h2 className="inline-flex items-center gap-2 text-xl">
        <Activity className="h-5 w-5 text-muted-foreground" /> Movimiento
      </h2>

      {feed.isLoading && <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>}

      {!feed.isLoading && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Todavía no ha pasado nada hoy.</p>
      )}

      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r, i) => (
          <li
            // El servidor no promete un id por entrada -- hay tipos que no
            // vienen de un pago -- así que la clave incluye la posición.
            key={`${r.at}-${r.paymentId ?? r.billId ?? i}`}
            className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0"
          >
            <span className="min-w-0">
              <span className="text-xs text-muted-foreground">{at(r.at)}</span>{" "}
              {KIND_KEY[r.kind] ? t(KIND_KEY[r.kind]!) : r.kind}
              {r.tableName && <span className="text-muted-foreground"> · {r.tableName}</span>}
              {r.paymentMethod && (
                <span className="text-muted-foreground">
                  {" "}
                  · {t(`method${r.paymentMethod}` as never)}
                </span>
              )}
            </span>
            {r.amountVes && (
              <span className="shrink-0 tabular-nums">
                {formatMoney(r.amountVes, "VES")}
                {r.tipVes && BigInt(r.tipVes) > 0n && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    +{formatMoney(r.tipVes, "VES")}
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
