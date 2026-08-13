import { createFileRoute } from "@tanstack/react-router";
import { GuestBillScreen } from "@/components/GuestBillScreen";

type Search = { qr?: string };

/** Catch-all público: cualquier /t/... (QRs viejos con /t/{tableId}) abre la cuenta. */
export const Route = createFileRoute("/t/$")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search["qr"] === "string" ? { qr: search["qr"] } : {},
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
  component: GuestSplatPage,
});

function GuestSplatPage() {
  const { qr } = Route.useSearch();
  return <GuestBillScreen {...(qr ? { qr } : {})} />;
}
