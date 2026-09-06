import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  GUEST_BASE_URL,
  isEphemeralGuestHost,
  tables as tablesApi,
  type FloorTable,
} from "@/lib/api";
import { usePayoutConfigured } from "@/lib/use-payout";
import { QrCode } from "@/components/QrCode";
import { LoadFailed } from "@/components/shell/LoadFailed";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * El código de una mesa, para mirarlo, copiarlo o imprimirlo.
 *
 * El token no se toca: se pide una vez por mesa y sólo se vuelve a pedir tras
 * rotarlo. Ni la carga útil, ni la caducidad, ni la forma del enlace cambian
 * aquí -- esto sólo decide cómo se enseña.
 */
export function TableQrDialog({
  table,
  open,
  onOpenChange,
}: {
  table: FloorTable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const payoutReady = usePayoutConfigured();
  const [rotateOpen, setRotateOpen] = useState(false);

  // La misma clave que usa el panel: abrir el QR desde Mesas no vuelve a pedirlo.
  const qrQuery = useQuery({
    queryKey: ["qr", table.id],
    queryFn: () => tablesApi.qrToken(table.id),
    enabled: open,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  // El token ya lleva mesa y restaurante, así que la ruta no lleva el id. Puede
  // traer caracteres que no son seguros en una URL: hay que escaparlo.
  const guestUrl = qrQuery.data
    ? `${GUEST_BASE_URL}/t?qr=${encodeURIComponent(qrQuery.data.token)}`
    : "";
  const ephemeralHost = isEphemeralGuestHost();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("qrOfTable")} · {table.name}
          </DialogTitle>
        </DialogHeader>

        <div className="px-1 text-center">
          <div id="qr-print-source" className="flex justify-center">
            {guestUrl ? (
              <QrCode value={guestUrl} size={200} />
            ) : (
              <div className="h-[224px] w-[224px] rounded-lg bg-secondary" />
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("qrScanHint")}</p>

          {/* Aquí y no en otro sitio: es el momento en que alguien va a imprimir
              un código y pegarlo en una mesa. Sin payee, el Pago Móvil de esa
              mesa no lleva a ninguna parte, y eso se descubre con el cliente ya
              sentado. */}
          {payoutReady === false && (
            <p className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-left text-[11px] text-muted-foreground">
              {t("payoutMissingQr")}{" "}
              <Link to="/settings" className="underline">
                {t("payoutConfigure")}
              </Link>
            </p>
          )}

          {qrQuery.isError && <LoadFailed onRetry={() => void qrQuery.refetch()} />}

          {guestUrl && (
            <>
              {/* Un código sacado de una vista previa funciona hoy y deja de
                  resolver cuando el host rota, semanas después y ya pegado a
                  una mesa. Avisar no basta, así que desde aquí no se imprime. */}
              {ephemeralHost && (
                <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs">
                  {t("qrEphemeralHost")}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => printQr(table.name, t("qrFor"), t("qrScanHint"))}
                  disabled={ephemeralHost}
                  title={ephemeralHost ? t("qrEphemeralHost") : undefined}
                  className="min-h-11 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {t("printQr")}
                </button>

                {/* El enlace lleva el token de invitado: nunca se enseña. */}
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(guestUrl);
                      toast.success(t("linkCopied"));
                    } catch {
                      toast.error(t("apiDown"));
                    }
                  }}
                  className="min-h-11 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
                >
                  {t("copyLink")}
                </button>
              </div>

              <a
                href={guestUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-4 text-sm transition-colors hover:bg-secondary"
              >
                <ExternalLink className="h-4 w-4" /> {t("previewOpenReal")}
              </a>

              <button
                onClick={() => setRotateOpen(true)}
                className="mt-2 min-h-11 w-full rounded-full px-4 text-xs text-muted-foreground transition-colors hover:bg-secondary"
              >
                {t("refreshQr")}
              </button>

              <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("refreshQr")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("rotateQrWarning")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          await tablesApi.rotateQr(table.id);
                          await qrQuery.refetch();
                          toast.success(t("refreshQr"));
                        } catch (error) {
                          toast.error(error instanceof ApiError ? error.code : t("apiDown"));
                        }
                      }}
                    >
                      {t("continue")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Abre una ventana con el código a tamaño de papel. Mismo marcado que ya usaba el panel. */
function printQr(tableName: string, kicker: string, hint: string) {
  const svg = document.getElementById("qr-print-source")?.querySelector("svg")?.outerHTML;
  if (!svg) return;
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return;
  const name = tableName.replace(/[<>&]/g, "");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>QR ${name}</title>
<style>
  @page { margin: 16mm; }
  body { margin:0; font-family: Georgia, serif; color:#111;
         display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card { text-align:center; border:2px solid #2C7A5C; border-radius:24px; padding:32px 40px; }
  .name { font-size:34px; margin:0 0 4px; }
  .kicker { font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:#8a8a8a; margin:0 0 18px; }
  .qr svg { width:320px; height:320px; }
  .hint { margin-top:18px; font-size:14px; color:#444; }
</style></head><body><div class="card">
  <p class="kicker">${kicker}</p>
  <h1 class="name">${name}</h1>
  <div class="qr">${svg}</div>
  <p class="hint">${hint}</p>
</div><script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`);
  win.document.close();
}
