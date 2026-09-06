import type { ReactNode } from "react";

/**
 * La cabecera de una sección: qué es esto, cuánto hay y qué se puede hacer.
 *
 * Cada pantalla del panel se la inventaba: la carta ponía título y dos frases
 * sueltas, tasas un título y un botón, pagos un título y otro botón en otro
 * sitio. Con una sola, las cinco empiezan igual y la acción principal está
 * siempre en el mismo lugar.
 *
 * `meta` es el recuento -- "11 productos · 5 secciones" -- y sale de datos
 * reales o no se pone. Un subtítulo que explica lo que ya dice el título
 * ocupa una línea y no informa de nada.
 */
export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
