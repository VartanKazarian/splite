import type { ReactNode } from "react";

/**
 * Cuando todavía no hay nada.
 *
 * No es decoración: una lista vacía sin explicación se lee como un fallo de
 * carga, y la reacción es recargar. Aquí se dice qué falta y se ofrece el gesto
 * que lo arregla, que casi siempre es el mismo botón de la cabecera.
 *
 * Sin ilustración ni caja enorme: ocupa lo que ocupa una fila y media.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
