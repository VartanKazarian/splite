import { createFileRoute } from "@tanstack/react-router";
import { TableLanding } from "@/components/TableLanding";
import { isGuestView, type GuestView } from "@/lib/guest-view";

type Search = { qr?: string; demo?: string; view?: GuestView };

export const Route = createFileRoute("/t/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["qr"] === "string" ? { qr: search["qr"] } : {}),
    ...(search["demo"] ? { demo: String(search["demo"]) } : {}),
    // Qué pantalla de la mesa se está mirando. En la URL y no en un estado
    // interno para que el botón "atrás" del teléfono vaya de la cuenta a la
    // carta, y de la carta a la mesa, en vez de salirse del sitio.
    ...(isGuestView(search["view"]) ? { view: search["view"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Tu mesa — Splite" },
      // La dirección lleva el QR de la mesa: que no la guarde un buscador ni la
      // reciba otra web al salir de aquí por un enlace.
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      {
        name: "description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      { property: "og:title", content: "Tu mesa — Splite" },
      {
        property: "og:description",
        content:
          "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuestPage,
});

function GuestPage() {
  const { qr, demo } = Route.useSearch();
  // La región principal va aquí y no dentro de la cuenta: la misma cuenta se
  // enseña incrustada en la portada, que ya tiene su propio <main>.
  return (
    <main>
      <TableLanding {...(qr ? { qr } : {})} demo={Boolean(demo)} />
    </main>
  );
}
