import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * La tasa se mira dentro de Pagos.
 *
 * Era una parada entera de la barra de arriba para dos números y un botón de
 * recargar: 900 px de alto en un teléfono con la mitad vacía, y una pantalla
 * que se consulta cuando una conversión no cuadra, no cada rato. Vive donde se
 * cuadra el dinero.
 *
 * La ruta se queda como redirección y no se borra: hay enlaces, marcadores y
 * pestañas abiertas apuntando aquí, y un 404 no es la respuesta a "esto se
 * mudó". Se reemplaza en el historial para que volver atrás no rebote.
 */
export const Route = createFileRoute("/tasas")({
  component: RatesRedirect,
});

function RatesRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/pagos", hash: "tasas", replace: true });
  }, [navigate]);
  return null;
}
