import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { useI18n } from "@/lib/i18n";

/** Lo que se descubre al deslizar, y cuánto hay que arrastrar para dejarlo abierto. */
const ACTION_WIDTH = 88;
const OPEN_AT = ACTION_WIDTH / 2;

/**
 * Una fila que se desliza a la izquierda y descubre un botón de borrar.
 *
 * Borrar una mesa estaba a cuatro toques: abrir la mesa, el menú de los tres
 * puntos, "Eliminar mesa" y confirmar. Para dar de baja media sala son treinta
 * y dos toques y una hoja que se abre y se cierra ocho veces.
 *
 * **Dos gestos, no uno.** Deslizar descubre el botón; borra el toque siguiente.
 * Un deslizamiento que borrase por sí solo convertiría en irreversible el gesto
 * con el que se recorre una lista en un teléfono, y lo que hay debajo es una
 * mesa con su historia.
 *
 * Con eventos `pointer` y no `touch`: son los mismos para un dedo y para un
 * ratón, así que el gesto también existe en el escritorio. Lo que no existe en
 * ninguno de los dos es para el teclado, y por eso **la ruta de siempre se
 * queda**: la hoja de la mesa conserva su "Eliminar mesa" en el menú. Esto es
 * un atajo, no la única puerta.
 *
 * Sólo una abierta a la vez, y lo decide quien la monta: dos filas abiertas son
 * dos botones rojos esperando un toque, y el pulgar baja por encima de los dos.
 *
 * `disabled` es para lo que no se puede borrar -- una mesa con cuenta abierta --
 * y entonces no hay nada que descubrir: la fila no se mueve. Es la misma regla
 * que ya aplica el menú de la hoja, y ofrecer un gesto para acabar en un error
 * es peor que no ofrecerlo.
 */
export function SwipeRow({
  children,
  onDelete,
  label,
  open,
  onOpenChange,
  disabled = false,
  pending = false,
}: {
  children: ReactNode;
  onDelete: () => void;
  /** Qué se borra, para quien no ve la fila. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const { t } = useI18n();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Se decide una vez por gesto: si el dedo va hacia abajo esto es la lista
  // desplazándose y no un deslizamiento, y robárselo deja una lista que no se
  // puede recorrer con el pulgar.
  const horizontal = useRef<boolean | null>(null);
  /**
   * Que este gesto fue un arrastre, para el clic que viene detrás.
   *
   * Soltar el dedo dispara un `click` sobre la fila, y ese clic no significa lo
   * que significaría solo: abría la mesa al deslizar, y -- peor -- cerraba de
   * inmediato la fila que el propio arrastre acababa de abrir, así que el botón
   * asomaba y desaparecía en el mismo gesto. Medido: `dx` llegaba a -88 y
   * volvía a 0 en el mismo instante.
   */
  const dragged = useRef(false);

  // Cuando la abre o la cierra quien la monta -- al abrirse otra --, la
  // posición tiene que seguirle.
  useEffect(() => setDx(open ? -ACTION_WIDTH : 0), [open]);

  if (disabled) return <>{children}</>;

  const release = () => {
    if (horizontal.current) {
      dragged.current = true;
      onOpenChange(dx < -OPEN_AT);
    } else {
      setDx(open ? -ACTION_WIDTH : 0);
    }
    start.current = null;
    horizontal.current = null;
    setDragging(false);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Detrás, y siempre en el árbol: si sólo existiera al abrirse aparecería
          de golpe bajo un dedo que ya se está moviendo. Fuera del recorrido del
          tabulador mientras está tapado. */}
      <div className="absolute inset-y-0 right-0 flex items-stretch" aria-hidden={!open}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          disabled={pending}
          onClick={onDelete}
          aria-label={`${t("deleteTable")} ${label}`}
          style={{ width: ACTION_WIDTH }}
          className="flex items-center justify-center bg-destructive text-destructive-foreground transition-opacity disabled:opacity-60"
        >
          <Trash2 aria-hidden className="h-5 w-5" />
        </button>
      </div>

      <div
        // El desplazamiento vertical se lo queda el navegador y el horizontal
        // es nuestro: sin esto el gesto compite con el scroll de la página.
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        // Sin transición mientras el dedo manda -- la fila va pegada a él -- y
        // con ella al soltar, que es cuando encaja.
        className={`relative bg-background ${dragging ? "" : "transition-transform duration-200"}`}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          // Se limpia aquí y no sólo al consumirlo: un arrastre que suelta
          // lejos de donde pulsó no llega a producir un `click`, así que la
          // marca se quedaba puesta y se comía el toque siguiente -- el de
          // verdad. Medido: tras deslizar, el toque para cerrar la fila no
          // hacía nada.
          dragged.current = false;
          start.current = { x: event.clientX, y: event.clientY };
          horizontal.current = null;
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const moveX = event.clientX - start.current.x;
          const moveY = event.clientY - start.current.y;
          if (horizontal.current === null) {
            if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
            horizontal.current = Math.abs(moveX) > Math.abs(moveY);
          }
          if (!horizontal.current) return;
          // Sólo hacia la izquierda, y nunca más allá del botón: arrastrar de
          // más no descubre nada y deja un hueco vacío bajo la fila.
          const from = open ? -ACTION_WIDTH : 0;
          setDx(Math.min(0, Math.max(-ACTION_WIDTH, from + moveX)));
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={() => {
          if (start.current) release();
        }}
        // El clic que remata un arrastre no abre la mesa: ya dijo lo que tenía
        // que decir al soltar. Un arrastre largo ni siquiera llega a ser un
        // clic sobre la fila -- soltar en otro sitio del que se pulsó deja el
        // clic en el ancestro común --, pero uno corto sí, y ése abría la mesa
        // sin que nadie la hubiera tocado.
        //
        // Lo que hace un toque *de verdad* sobre una fila abierta no se decide
        // aquí sino en `onSelect`, que es de quien monta la fila: interceptarlo
        // en captura no impide el `onClick` del botón de dentro -- medido: la
        // fila se cerraba y la hoja de la mesa se abría igual.
        onClickCapture={(event) => {
          if (!dragged.current) return;
          dragged.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
