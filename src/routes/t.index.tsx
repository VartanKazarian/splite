import { createFileRoute } from "@tanstack/react-router";
import { GuestBillScreen } from "@/components/GuestBillScreen";

type Search = { qr?: string; demo?: string };

export const Route = createFileRoute("/t/")({
  validateSearch: (search: Record<string, unknown>): Search =>
    ({
      ...(typeof search['qr'] === "string" ? { qr: search['qr'] } : {}),
      ...(search['demo'] ? { demo: String(search['demo']) } : {}),
    }),
  head: () => ({
    meta: [
      { title: "Tu cuenta — Splite" },
      {
        name: "description",
        content: "Escanea el QR de tu mesa, revisa la cuenta y divídela sin instalar nada.",
      },
      { property: "og:title", content: "Tu cuenta — Splite" },
      { property: "og:description", content: "Divide la cuenta del restaurante desde tu móvil." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuestPage,
});

function GuestPage() {
  const { qr, demo } = Route.useSearch();
  return <GuestBillScreen {...(qr ? { qr } : {})} demo={Boolean(demo)} />;
}
