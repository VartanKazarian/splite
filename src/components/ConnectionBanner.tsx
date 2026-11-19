import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

import { useI18n } from "@/lib/i18n";

/**
 * «Sin conexión», arriba, mientras dure.
 *
 * En un restaurante la señal va y viene, y sin esto la pantalla se quedaba
 * igual -- con datos viejos o un botón que no responde -- sin decir por qué.
 * Al volver no hace falta nada: las consultas se ponen al día solas cuando el
 * navegador recupera la red (`refetchOnReconnect`).
 */
export function ConnectionBanner() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      data-testid="connection-banner"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-center text-sm text-background"
    >
      <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
      {t("offlineBanner")}
    </div>
  );
}
