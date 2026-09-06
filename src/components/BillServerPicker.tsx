import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, bills, staff, type StaffMember, type StaffRole } from "@/lib/api";

/**
 * Quién atendió la mesa, y cómo corregirlo.
 *
 * Abrir una cuenta ya la atribuye a quien la abre, así que el informe por
 * mesero nunca estuvo vacío. Lo que faltaba era la corrección: eso acierta
 * cuando quien toma la comanda abre la cuenta, y se equivoca cuando la abre un
 * anfitrión o la caja por él -- y hasta ahora no había forma de arreglarlo.
 *
 * OWNER y MANAGER, como en el servidor. Un mesero no se asigna sus propias
 * mesas: esto mueve dinero entre personas, porque la atribución se lee en el
 * momento de consultar y corregirla mueve también las propinas de ayer.
 *
 * **Cómo se llama cada quien.** Esto enseñaba la dirección de correo, así que
 * una mesa la había atendido "varto23@gmail.com". Cada persona puede ponerse un
 * nombre desde su cuenta; si lo ha puesto, es el que se usa. El correo queda de
 * reserva -- y no como sustituto en el servidor, que devuelve `null` a
 * propósito: qué enseñar mientras tanto se decide aquí.
 */
/** El nombre que se ha puesto, y si no, el correo. Nunca los dos. */
function nameOf(member: StaffMember | undefined, fallback: string) {
  const chosen = member?.displayName?.trim();
  if (chosen) return chosen;
  return member?.email ?? fallback;
}

export function BillServerPicker({
  billId,
  servedBy,
  canAssign,
  onChanged,
}: {
  billId: string;
  servedBy: string | null | undefined;
  canAssign: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const team = useQuery({
    queryKey: ["staff"],
    queryFn: () => staff.list(),
    enabled: canAssign,
    retry: false,
    // El personal cambia mucho menos que las cuentas.
    staleTime: 5 * 60_000,
  });

  const assign = useMutation({
    mutationFn: (userId: string | null) => bills.setServer(billId, userId),
    onSuccess: () => {
      toast.success(t("saved"));
      queryClient.invalidateQueries({ queryKey: ["bill", billId] });
      onChanged();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.code === "STAFF_NOT_FOUND") return toast.error(t("serverGone"));
        if (error.code === "FORBIDDEN_ROLE") return toast.error(t("serverForbidden"));
        return toast.error(`${error.code} · ${error.message}`);
      }
      return toast.error(t("apiDown"));
    },
  });

  // Sólo gente activa: el servidor rechaza asignar una cuenta a alguien de baja,
  // y ofrecerlo sería ofrecer un error.
  const active = (team.data ?? []).filter((m) => m.active);
  const current = active.find((m) => m.id === servedBy);

  if (!canAssign) {
    // Un mesero o caja ve a quién está atribuida, pero no la cambia.
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" />
        {servedBy ? nameOf(current, t("servedByUnknown")) : t("servedByNobody")}
      </p>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <UserRound className="h-3.5 w-3.5" />
      <span>{t("servedBy")}</span>
      <select
        value={servedBy ?? ""}
        disabled={assign.isPending || team.isLoading}
        onChange={(e) => assign.mutate(e.target.value || null)}
        aria-label={t("servedByAria")}
        className="min-h-11 rounded-lg border border-input bg-secondary px-3 text-xs text-foreground outline-none focus:border-ring disabled:opacity-50"
      >
        <option value="">{t("servedByNone")}</option>
        {active.map((m) => (
          <option key={m.id} value={m.id}>
            {nameOf(m, m.email)}
          </option>
        ))}
        {/* Quien atendió pero ya no está activo: se conserva para no perder la
            atribución al abrir el desplegable. */}
        {servedBy && !current && <option value={servedBy}>{t("servedByUnknown")}</option>}
      </select>
    </label>
  );
}

/** Los dos roles que el servidor acepta en PATCH /bills/{id}/server. */
export const canAssignServer = (role: StaffRole | undefined) =>
  role === "OWNER" || role === "MANAGER";
