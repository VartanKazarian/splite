import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, TIP_OPTIONS, account, type Account, type DefaultTipPct } from "@/lib/api";
import "@/lib/i18n-staff";
import { staffErrorText } from "@/lib/staff-errors";

/**
 * La propina que la mesa trae marcada.
 *
 * Era un 10 % fijo en la pantalla del comensal, encima del servicio. Si eso
 * encaja con la costumbre del local -- o si, cobrando ya un 10 % de servicio,
 * lo correcto es no marcar nada -- lo decide el restaurante. Las mismas cuatro
 * opciones que ve el comensal, y se guarda al tocar: es una sola decisión, sin
 * formulario que rellenar.
 */
export function DefaultTipSetting() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });
  const current = accountQuery.data?.defaultTipPct ?? 10;

  const save = useMutation({
    mutationFn: (defaultTipPct: DefaultTipPct) => account.updateProfile({ defaultTipPct }),
    onSuccess: (data: Account) => {
      queryClient.setQueryData(["account"], data);
      toast.success(t("defaultTipSaved"));
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) toast.error(staffErrorText(error, t));
      else toast.error(t("apiDown"));
    },
  });

  // Mientras se guarda se ve ya lo elegido: esperar a la respuesta para mover
  // la marca hace pensar que el toque no ha entrado.
  const shown = save.isPending && save.variables !== undefined ? save.variables : current;

  return (
    <section className="surface mt-6 p-6" aria-labelledby="default-tip-title">
      <h2 id="default-tip-title" className="text-xl">
        {t("defaultTipTitle")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("defaultTipHint")}</p>
      <div
        role="group"
        aria-labelledby="default-tip-title"
        className="mt-4 grid grid-cols-5 gap-2 sm:max-w-md"
      >
        {TIP_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={shown === p}
            disabled={!accountQuery.data || save.isPending}
            onClick={() => p !== current && save.mutate(p)}
            // «Sin propina» a dos columnas, como en la mesa: en una se partía
            // en dos líneas y la fila salía más alta por un lado.
            className={`min-h-11 rounded-lg border-[1.5px] px-2 text-sm font-medium transition-colors disabled:cursor-default ${
              p === 0 ? "col-span-2" : ""
            } ${
              shown === p
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border-strong bg-card text-foreground hover:bg-secondary disabled:opacity-60"
            }`}
          >
            {p === 0 ? t("defaultTipNone") : `${p}%`}
          </button>
        ))}
      </div>
      {accountQuery.isError && (
        <p className="mt-3 text-sm text-destructive">{staffErrorText(accountQuery.error, t)}</p>
      )}
    </section>
  );
}
