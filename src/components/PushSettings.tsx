import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth, push as pushApi } from "@/lib/api";
import {
  PushError,
  disablePush,
  enablePush,
  pushStatus,
  pushSupport,
  type PushStatus,
  type PushSupport,
} from "@/lib/push";
import "@/lib/i18n-staff";

/**
 * «Avisos en este teléfono» (R19).
 *
 * Por teléfono y por persona: se encienden aquí, en el teléfono que uno lleva
 * encima, y llega lo que le toca por su rol. Un iPhone no ofrece el botón
 * hasta que el panel está en la pantalla de inicio, porque fuera de ahí Safari
 * no entrega avisos: un interruptor que no puede funcionar es peor que una
 * instrucción.
 */
export function PushSettings() {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });
  const role = me.data?.user.role;

  // Lo que el navegador sabe, después de montar: en el servidor no hay
  // navegador, y pintarlo antes haría que la primera vista no coincidiera.
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOff, setServerOff] = useState(false);

  const refresh = async () => {
    setSupport(pushSupport());
    setStatus(await pushStatus().catch(() => "off" as const));
  };
  useEffect(() => {
    void refresh();
  }, []);

  const what =
    role === "CASHIER"
      ? t("pushWhatCashier")
      : role === "WAITER"
        ? t("pushWhatWaiter")
        : t("pushWhatManager");

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      toast.success(t("pushOnToast"));
    } catch (err) {
      if (err instanceof PushError && err.reason === "server-off") setServerOff(true);
      else if (!(err instanceof PushError)) toast.error(t("pushFailed"));
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      await pushApi.test();
      toast.success(t("pushTestSent"));
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.code === "PUSH_NOT_SUBSCRIBED"
          ? t("pushTestNotSubscribed")
          : t("pushFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface mt-4 p-6" data-testid="push-settings">
      <h2 className="inline-flex items-center gap-2 text-xl">
        <BellRing className="h-5 w-5 text-muted-foreground" /> {t("pushTitle")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{what}</p>

      {support === null || (support === "ok" && status === null) ? null : support ===
        "unsupported" ? (
        <p className="mt-4 text-sm" data-testid="push-unsupported">
          {t("pushUnsupported")}
        </p>
      ) : support === "ios-install" ? (
        <p className="mt-4 rounded-lg bg-secondary p-4 text-sm" data-testid="push-ios-install">
          {t("pushIosInstall")}
        </p>
      ) : serverOff ? (
        <p className="mt-4 text-sm" data-testid="push-server-off">
          {t("pushServerOff")}
        </p>
      ) : status === "denied" ? (
        <p className="mt-4 rounded-lg bg-secondary p-4 text-sm" data-testid="push-denied">
          {t("pushDenied")}
        </p>
      ) : status === "on" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="push-on">
          <span className="mr-auto text-sm font-medium text-primary-ink">{t("pushIsOn")}</span>
          <button
            type="button"
            disabled={busy}
            onClick={sendTest}
            className="min-h-11 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
          >
            {t("pushSendTest")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={turnOff}
            className="min-h-11 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
          >
            {t("pushTurnOff")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={turnOn}
          data-testid="push-turn-on"
          className="mt-4 min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {t("pushTurnOn")}
        </button>
      )}
    </section>
  );
}
