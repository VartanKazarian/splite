import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { formatMoney, payments, type ActivityEntry } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatWhen } from "../lib/dates";

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

/**
 * La hora si es de hoy, y el día si no.
 *
 * Enseñaba sólo la hora, y las últimas veinte entradas no caben en un turno:
 * la lista iba "10:02 p. m., 08:49 a. m., 01:51 p. m." y parecía desordenada
 * cuando lo que pasaba es que eran días distintos.
 */

/**
 * Lo que ha ido pasando en el turno.
 *
 * El endpoint existía y no lo llamaba nadie, así que para saber si acababa de
 * entrar un cobro había que mirar mesa por mesa. Es un listado del servidor: no
 * se deriva de los otros, que traen estado actual y no historia.
 */
/**
 * Con `billId` se convierte en la actividad de una cuenta.
 *
 * Es el mismo listado y la misma consulta -- no hay un endpoint por cuenta --
 * filtrado por la que se está mirando. Eso acota lo que puede enseñar: son los
 * movimientos **recientes**, no el histórico de la cuenta. Para lo que se usa
 * dentro de una mesa -- «¿entró ya el pago que me acaban de decir?» -- es
 * justo lo que hace falta, y lo que no cabe en esa ventana ya está sumado
 * arriba, en lo pagado y lo que falta.
 *
 * Por eso pide más entradas que el listado general: con veinte, en un servicio
 * cargado, los movimientos de una mesa concreta se salen de la página.
 */
export function ActivityFeed({ billId }: { billId?: string }) {
  const { t, lang } = useI18n();
  const limit = billId ? 50 : 20;
  const feed = useQuery({
    queryKey: ["payments-activity", limit],
    queryFn: () => payments.activity(undefined, limit),
    retry: false,
    refetchInterval: 30000,
  });

  /**
   * El más reciente arriba.
   *
   * El servidor los manda del más viejo al más nuevo, y con razón: la última
   * entrada es el cursor del siguiente sondeo, y esa promesa no debe depender
   * de cómo elija pintarlos un cliente. Así que se le da la vuelta aquí.
   *
   * Y arriba el nuevo porque esto es un registro de lo que acaba de pasar, no
   * una cola de trabajo. Al final de la lista se llega bajando; a lo que entró
   * hace diez segundos hay que llegar sin hacer nada.
   */
  const all: ActivityEntry[] = [...(feed.data?.data ?? [])].reverse();
  const rows = billId ? all.filter((r) => r.billId === billId) : all;

  /*
   * Dentro de una cuenta, sin movimientos no se dibuja nada.
   *
   * En la pantalla de cobros el vacío es una respuesta -- «no ha pasado nada en
   * el turno» -- y merece decirse. Dentro de la hoja de una mesa es una caja
   * vacía entre el importe y los botones, empujando hacia abajo lo que se ha
   * venido a hacer.
   */
  if (billId && rows.length === 0) return null;

  return (
    <section className={billId ? "mt-4" : "surface p-5"}>
      <h2
        className={
          billId ? "text-sm text-muted-foreground" : "inline-flex items-center gap-2 text-xl"
        }
      >
        {billId ? (
          t("feedBillTitle")
        ) : (
          <>
            <Activity className="h-5 w-5 text-muted-foreground" /> {t("feedTitle")}
          </>
        )}
      </h2>

      {feed.isLoading && <p className="mt-3 text-sm text-muted-foreground">{t("loading")}</p>}

      {!billId && !feed.isLoading && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{t("feedEmpty")}</p>
      )}

      {/* Dos líneas por entrada, no una frase.
          Iban en una sola: fecha en gris, tipo, mesa y método encadenados con
          puntos, y el importe al final. En un teléfono esa frase ocupaba dos o
          tres líneas, el importe se quedaba pegado a la primera y lo que se
          leía era prosa con un número metido en medio. Arriba va lo que pasó y
          cuánto -- el importe siempre en la misma columna, a la derecha, con
          cifras tabulares, que es lo que permite compararlos de arriba abajo --
          y debajo, en gris, cuándo y por qué vía. La propina baja con ellos:
          al lado del importe eran dos números discutiendo por la misma
          columna. */}
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r, i) => (
          <li
            // El servidor no promete un id por entrada -- hay tipos que no
            // vienen de un pago -- así que la clave incluye la posición.
            key={`${r.at}-${r.paymentId ?? r.billId ?? i}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-border pb-2 last:border-0"
          >
            <span className="min-w-0 truncate">
              {t(KIND_KEY[r.kind] ?? "feedOther")}
              {!billId && r.tableName && (
                <span className="text-muted-foreground"> · {r.tableName}</span>
              )}
            </span>
            {r.amountVes && (
              <span className="figure shrink-0">{formatMoney(r.amountVes, "VES")}</span>
            )}
            <span className="col-span-2 mt-0.5 text-xs text-muted-foreground">
              {formatWhen(r.at, lang) ?? ""}
              {r.paymentMethod && <> · {t(`method${r.paymentMethod}` as never)}</>}
              {r.tipVes && BigInt(r.tipVes) > 0n && (
                <>
                  {" "}
                  · {t("tip")} <span className="figure">+{formatMoney(r.tipVes, "VES")}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
