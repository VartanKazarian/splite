import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, orders } from "@/lib/api";
import { Switch } from "@/components/ui/switch";

/**
 * Si el primer pedido de cada teléfono nuevo espera a que la sala lo apruebe.
 *
 * El QR está pegado a la mesa: quien lo fotografía puede pedir desde fuera, o
 * abrir una cuenta en una mesa vacía, como broma. Encendido, ese primer pedido
 * sale en la bandeja con Aprobar / Rechazar y no toca ninguna cuenta hasta
 * entonces. Apagado por defecto: un local que conoce a su clientela no tiene
 * por qué pagar la espera.
 *
 * Lo cambian dueño y encargado; el resto lo ve, porque cambia lo que sale en la
 * bandeja.
 */
export function OrderApprovalSetting({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const queryClient = useQueryClient();

  const setting = useQuery({
    queryKey: ["order-settings"],
    queryFn: () => orders.settings(),
    retry: false,
  });

  const save = useMutation({
    mutationFn: (on: boolean) => orders.setSettings(on),
    onSuccess: (data) => {
      queryClient.setQueryData(["order-settings"], data);
      toast.success(data.approveNewPhones ? t("orderApprovalOn") : t("orderApprovalOff"));
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? `${error.code} · ${error.message}` : t("apiDown")),
  });

  // Un backend sin el ajuste todavía: no se enseña un interruptor que no hace nada.
  if (setting.isError) return null;

  const checked = save.isPending
    ? Boolean(save.variables)
    : Boolean(setting.data?.approveNewPhones);

  return (
    <section className="surface mt-6 p-6" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-xl">
        {t("orderApprovalTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("orderApprovalBody")}</p>
      <label htmlFor={`${id}-switch`} className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{t("orderApprovalLabel")}</span>
        <Switch
          id={`${id}-switch`}
          checked={checked}
          disabled={!canEdit || setting.isLoading || save.isPending}
          onCheckedChange={(on) => save.mutate(on)}
        />
      </label>
      {!canEdit && (
        <p className="mt-2 text-xs text-muted-foreground">{t("orderApprovalReadOnly")}</p>
      )}
    </section>
  );
}
