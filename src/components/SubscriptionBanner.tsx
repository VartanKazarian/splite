import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { auth, subscription } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/**
 * El aviso de que se debe algo a Splite, o de que la suscripción está
 * suspendida. Sólo para dueño y encargado: al mesero no le sirve de nada y no
 * es suyo resolverlo. Y sólo cuando hay algo que hacer: un cargo pendiente que
 * aún no vence no se anuncia en cada pantalla.
 */
export function SubscriptionBanner() {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => auth.me(), retry: false });
  const role = me.data?.user.role;
  const canSee = role === "OWNER" || role === "MANAGER";
  const query = useQuery({
    queryKey: ["subscription"],
    queryFn: () => subscription.get(),
    enabled: canSee,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const sub = query.data?.subscription;
  if (!canSee || !sub) return null;
  const blocked = sub.status === "SUSPENDED" || sub.status === "CANCELLED";
  if (!blocked && sub.state !== "OVERDUE") return null;

  return (
    <div
      className="border-b border-destructive/40 bg-destructive/10"
      data-testid="subscription-banner"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-2 px-5 py-2.5 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="min-w-0">
          {blocked ? t("subBannerSuspended") : t("subBannerOverdue")}{" "}
          <Link to="/settings" hash="suscripcion" className="underline underline-offset-2">
            {t("subBannerSee")}
          </Link>
        </p>
      </div>
    </div>
  );
}
