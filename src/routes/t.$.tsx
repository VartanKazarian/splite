import { createFileRoute } from "@tanstack/react-router";
import { TableLanding } from "@/components/TableLanding";
import { isGuestView, type GuestView } from "@/lib/guest-view";

type Search = { qr?: string; view?: GuestView };

/** Catch-all público: cualquier /t/... (QRs viejos con /t/{tableId}) abre la cuenta. */
export const Route = createFileRoute("/t/$")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["qr"] === "string" ? { qr: search["qr"] } : {}),
    // Ver `t.index.tsx`: la pantalla va en la URL para que "atrás" funcione.
    ...(isGuestView(search["view"]) ? { view: search["view"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Tu mesa — Splite" },
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
  component: GuestSplatPage,
});

function GuestSplatPage() {
  const { qr } = Route.useSearch();
  return <TableLanding {...(qr ? { qr } : {})} />;
}
