import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Una cifra de contexto: mesas ocupadas, cobrado hoy, avisos.
 *
 * **Por qué cambia de forma con el ancho.** En tres columnas dentro de un
 * teléfono cada tarjeta medía unos 118 px: "MESAS OCUPADAS" se partía en dos
 * líneas y "1.550,00 Bs" en otras dos, así que las tres cifras acababan a
 * alturas distintas y no había forma de compararlas de un vistazo -- que es
 * justo lo único que se le pide a esta fila.
 *
 * En el móvil, entonces, cada cifra es una línea entera: rótulo a la
 * izquierda, número a la derecha. Al compartir el borde derecho las tres
 * quedan en columna, y con `figure` (cifras tabulares) los dígitos caen unos
 * sobre otros. Desde `sm` vuelven las tres tarjetas en fila.
 *
 * **Y por qué `subgrid`.** Con las tarjetas una al lado de la otra, un rótulo
 * de dos líneas empujaba su cifra hacia abajo y rompía la línea de base común.
 * Las tres filas -- rótulo, cifra, apostilla -- las define la rejilla de
 * fuera; cada tarjeta se limita a ocuparlas. Donde no haya `subgrid` cada
 * tarjeta se mide sola, que es como estaba antes: se degrada, no se rompe.
 *
 * `tone` no es decoración. Ámbar significa "hay algo que atender" y sólo lo
 * pone quien tiene un motivo real; el resto se queda neutro. Un panel donde
 * todo lleva color no distingue lo que hay que mirar de lo que no.
 *
 * El estado nunca va sólo en el color: `hint` lleva la misma información
 * escrita, que es lo que lee alguien que no distingue el verde del ámbar.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "attention";
  loading?: boolean;
}) {
  return (
    <div
      className={`surface grid min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 px-4 py-3 sm:row-span-3 sm:grid-cols-1 sm:grid-rows-subgrid sm:p-4 ${
        tone === "attention" ? "border-amber-500/50 bg-amber-500/5" : ""
      }`}
    >
      <p className="text-[11px] uppercase leading-tight tracking-wider text-muted-foreground sm:tracking-widest">
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-6 w-16 justify-self-end sm:mt-1 sm:justify-self-start" />
      ) : (
        <p
          className={`figure justify-self-end text-xl sm:mt-1 sm:justify-self-start lg:text-2xl ${
            tone === "attention" ? "text-amber-700" : ""
          }`}
        >
          {value}
        </p>
      )}
      {/* Siempre presente, aunque venga vacía: es la tercera fila de la
          rejilla compartida, y si desapareciera en una tarjeta y no en otra
          volverían a descuadrarse. Vacía no ocupa nada. */}
      <p className="col-start-2 justify-self-end text-xs text-muted-foreground sm:col-start-1 sm:mt-0.5 sm:justify-self-start sm:truncate">
        {hint}
      </p>
    </div>
  );
}
