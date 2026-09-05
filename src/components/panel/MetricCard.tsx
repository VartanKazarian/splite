import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Una cifra de contexto: mesas ocupadas, cobrado hoy, avisos.
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
      className={`surface min-w-0 p-4 ${tone === "attention" ? "border-amber-500/50 bg-amber-500/5" : ""}`}
    >
      <p className="text-[10px] uppercase leading-tight tracking-wider text-muted-foreground sm:text-[11px] sm:tracking-widest">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1.5 h-7 w-16" />
      ) : (
        <p
          className={`figure mt-1 text-xl sm:text-2xl ${tone === "attention" ? "text-amber-700" : ""}`}
        >
          {value}
        </p>
      )}
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
