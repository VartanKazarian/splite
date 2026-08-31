import { createFileRoute } from "@tanstack/react-router";
import { TableLanding } from "@/components/TableLanding";

type Search = { qr?: string; demo?: string };

export const Route = createFileRoute("/t/")({
  validateSearch: (search: Record<string, unknown>): Search =>
    ({
      ...(typeof search['qr'] === "string" ? { qr: search['qr'] } : {}),
      ...(search['demo'] ? { demo: String(search['demo']) } : {}),
    }),
  head: () => ({
    meta: [
      { title: "Tu mesa — Splite" },
      {
        name: "description",
        content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Tu mesa — Splite" },
      { property: "og:description", content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuestPage,
});

function GuestPage() {
  const { qr, demo } = Route.useSearch();
  return <TableLanding {...(qr ? { qr } : {})} demo={Boolean(demo)} />;
}
