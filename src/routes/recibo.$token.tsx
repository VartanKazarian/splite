import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ApiError, sharedReceipts } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ReceiptView } from "@/components/GuestReceipt";
import { LangToggle } from "@/components/LangToggle";
import "@/lib/i18n-guest";

/**
 * Un recibo abierto desde el enlace que el comensal se mandó por WhatsApp (R20).
 *
 * Sin sesión de mesa: el enlace firmado es el permiso, y dura seis meses. Es el
 * mismo recibo del teléfono que pagó (`ReceiptView`), con la referencia
 * bancaria recortada a cuatro cifras por el servidor.
 */
export const Route = createFileRoute("/recibo/$token")({
  head: () => ({
    meta: [
      { title: "Recibo — Splite" },
      // La dirección es el permiso: que no la guarde un buscador ni la reciba
      // otra web al salir de aquí por un enlace.
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SharedReceiptPage,
});

function SharedReceiptPage() {
  const { token } = Route.useParams();
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["shared-receipt", token],
    queryFn: () => sharedReceipts.get(token),
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-4 py-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="font-display text-sm tracking-[0.2em]">
          SPLITE
        </Link>
        <LangToggle />
      </div>

      {query.isPending ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <section className="surface mt-6 p-6" data-testid="shared-receipt-invalid">
          <h1 className="font-display text-xl">{t("sharedReceiptInvalidTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {query.error instanceof ApiError && query.error.status === 404
              ? t("sharedReceiptInvalidBody")
              : t("apiDown")}
          </p>
        </section>
      ) : (
        <div data-testid="shared-receipt">
          <ReceiptView receipt={query.data} shared />
        </div>
      )}
    </main>
  );
}
