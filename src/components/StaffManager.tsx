import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldOff, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  STAFF_RANK,
  staff,
  errorFields,
  type StaffMember,
  type StaffRole,
} from "@/lib/api";
import { ErrorBox } from "@/routes/dashboard";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useI18n } from "@/lib/i18n";

/** Los nombres viven en el diccionario: son los mismos que enseña la cabecera. */
const ROLE_HINT_KEY: Record<
  StaffRole,
  "roleOwnerWhat" | "roleManagerWhat" | "roleCashierWhat" | "roleWaiterWhat"
> = {
  OWNER: "roleOwnerWhat",
  MANAGER: "roleManagerWhat",
  CASHIER: "roleCashierWhat",
  WAITER: "roleWaiterWhat",
};

/** El servidor exige 12 caracteres; decirlo antes evita un viaje y un 400. */
const MIN_PASSWORD = 12;

/**
 * La gente que trabaja en el restaurante.
 *
 * El backend tiene esto entero desde hace tiempo -- cuatro roles, y un servicio
 * que decide quién puede tocar a quién -- y no había ninguna pantalla, así que
 * en la práctica sólo podía entrar la cuenta con la que se registró el
 * restaurante. Los roles se aplicaban en cada ruta sin que hubiera nadie a
 * quien distinguir.
 *
 * Las reglas de rango no se reimplementan aquí. Se piden botones acordes al
 * rango de quien mira, para no ofrecer lo que va a ser rechazado, pero la
 * decisión es del servidor y sus códigos de error son los que se traducen: una
 * comprobación duplicada en el cliente es una que un día se queda atrás.
 */
export function StaffManager({ me }: { me: { id: string; role: StaffRole } }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("WAITER");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["staff"],
    queryFn: () => staff.list(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff"] });

  const fail = (error: unknown) => {
    if (!(error instanceof ApiError)) return toast.error(t("apiUnreachable"));
    const say: Partial<Record<string, string>> = {
      STAFF_EMAIL_TAKEN: t("staffEmailTaken"),
      STAFF_ROLE_TOO_HIGH: t("staffNoHigherRole"),
      STAFF_OUTRANKED: t("staffPeerOrAbove"),
      STAFF_SELF_FORBIDDEN: t("staffNoSelfChange"),
      STAFF_LAST_OWNER: t("staffNeedsOwner"),
      STAFF_NOT_FOUND: t("staffGone"),
      FORBIDDEN_ROLE: "Tu rol no permite gestionar al personal",
    };
    const known = say[error.code];
    if (error.code === "STAFF_NOT_FOUND") refresh();
    if (known) return toast.error(known);
    if (error.code === "VALIDATION_FAILED") {
      setFieldErrors(errorFields(error));
      return toast.error(error.message);
    }
    return toast.error(`${error.code} · ${error.message}`);
  };

  const create = useMutation({
    mutationFn: () => staff.create({ email: email.trim().toLowerCase(), password, role }),
    onSuccess: (user) => {
      setEmail("");
      setPassword("");
      setRole("WAITER");
      setFieldErrors({});
      setAdding(false);
      toast.success(`${user.email} añadido como ${t(`role${user.role}` as never)}`);
      refresh();
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: (p: { id: string; body: { role?: StaffRole; active?: boolean } }) =>
      staff.update(p.id, p.body),
    onSuccess: (res) => {
      // El número de sesiones cerradas es la mitad honesta de la respuesta: el
      // token que esa persona lleva encima sigue valiendo hasta que caduque.
      toast.success(
        res.sessionsRevoked > 0
          ? `Guardado. ${res.sessionsRevoked} sesión(es) cerrada(s).`
          : t("staffSaved"),
      );
      refresh();
    },
    onError: fail,
  });

  const resetPassword = useMutation({
    mutationFn: (p: { id: string; password: string }) => staff.resetPassword(p.id, p.password),
    onSuccess: (res) =>
      toast.success(
        res.sessionsRevoked > 0
          ? `Contraseña cambiada. ${res.sessionsRevoked} sesión(es) cerrada(s).`
          : t("staffPasswordChanged"),
      ),
    onError: fail,
  });

  const myRank = STAFF_RANK[me.role];
  /** Los roles que quien mira puede otorgar: por debajo del suyo, salvo el dueño. */
  const grantable = useMemo(
    () =>
      (Object.keys(STAFF_RANK) as StaffRole[])
        .filter((r) => (me.role === "OWNER" ? true : STAFF_RANK[r] < myRank))
        .sort((a, b) => STAFF_RANK[b] - STAFF_RANK[a]),
    [me.role, myRank],
  );

  /** Ni a uno mismo ni a un igual o superior: lo mismo que decide el servidor. */
  const canTouch = (m: StaffMember) =>
    m.id !== me.id && (me.role === "OWNER" ? m.role !== "OWNER" : STAFF_RANK[m.role] < myRank);

  const rows = list.data ?? [];
  const busy = create.isPending || update.isPending || resetPassword.isPending;
  const forbidden =
    list.error instanceof ApiError &&
    (list.error.code === "FORBIDDEN_ROLE" || list.error.status === 403);

  if (forbidden) {
    return (
      <section className="surface mt-4 p-6">
        <h2 className="text-xl">{t("staffTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sólo el dueño y los encargados pueden gestionar al personal.
        </p>
      </section>
    );
  }

  return (
    <section className="surface mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-xl">
          <Users className="h-5 w-5 text-muted-foreground" /> Personal
        </h2>
        {/* Abierto el formulario, el mismo botón lo cierra, y entonces deja de
            ser verde: el verde es para lo que hace avanzar, y cancelar no. El
            que avanza es «Añadir», dentro del formulario. */}
        <button
          onClick={() => setAdding((v) => !v)}
          disabled={busy || grantable.length === 0}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-sm disabled:opacity-60 ${
            adding
              ? "border border-border-strong bg-background text-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {adding ? (
            <>
              <X className="h-4 w-4" /> {t("cancel")}
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" /> {t("staffAddPerson")}
            </>
          )}
        </button>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Cada quien entra con su propio correo. Un mesero abre cuentas y añade productos; caja cobra
        y verifica pagos; el encargado además lleva el menú y las mesas.
      </p>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          // `grid-cols-1` es `minmax(0, 1fr)`: sin él la columna mide lo que
          // la opción más larga del rol («Mesero — Abrir cuentas y añadir
          // productos») y en un teléfono el formulario se salía 141 px.
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-secondary p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">{t("email")}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoComplete="off"
                className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              />
              {fieldErrors["email"] && (
                <span className="text-[11px] text-destructive">{fieldErrors["email"]}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Rol</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                className="min-h-11 w-full min-w-0 truncate rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              >
                {grantable.map((r) => (
                  <option key={r} value={r}>
                    {t(`role${r}` as never)} — {t(ROLE_HINT_KEY[r])}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              Contraseña provisional (mínimo {MIN_PASSWORD} caracteres)
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD}
              maxLength={128}
              autoComplete="new-password"
              className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
            />
            {fieldErrors["password"] && (
              <span className="text-[11px] text-destructive">{fieldErrors["password"]}</span>
            )}
          </label>
          <p className="text-[11px] text-muted-foreground">
            Se la das tú en persona. Dile que la cambie desde Ajustes en cuanto entre: hasta
            entonces la sabéis los dos.
          </p>
          <div>
            <button
              type="submit"
              disabled={busy || password.length < MIN_PASSWORD}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm text-primary-foreground disabled:opacity-60"
            >
              {create.isPending ? t("staffAdding") : t("staffAdd")}
            </button>
          </div>
        </form>
      )}

      {list.isLoading && <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>}
      {list.isError && !forbidden && (
        <ErrorBox error={list.error} fallback={t("staffLoadFailed")} />
      )}

      <ul className="mt-4 divide-y divide-border">
        {rows.map((m) => {
          const mine = m.id === me.id;
          const editable = canTouch(m);
          return (
            <li key={m.id} className="py-3">
              {/* Quién, y su rol al lado. El nombre si se lo ha puesto y el
                  correo debajo, entero: cortado a «owner@exam…» no se sabía
                  de quién era la fila. */}
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${m.active ? "" : "text-muted-foreground"}`}>
                    {m.displayName?.trim() || m.email}
                    {mine && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {t("staffYou")}
                      </span>
                    )}
                    {!m.active && (
                      <span className="ml-2 rounded-full bg-secondary px-1.5 py-px text-[11px] text-muted-foreground">
                        {t("staffInactive")}
                      </span>
                    )}
                  </p>
                  {m.displayName?.trim() && (
                    <p className="break-all text-xs text-muted-foreground">{m.email}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{t(ROLE_HINT_KEY[m.role])}</p>
                </div>

                <select
                  value={m.role}
                  disabled={busy || !editable}
                  onChange={(e) =>
                    update.mutate({ id: m.id, body: { role: e.target.value as StaffRole } })
                  }
                  aria-label={`${t("staffRole")}: ${m.email}`}
                  className="min-h-11 shrink-0 rounded-lg border border-input bg-secondary px-2 text-xs outline-none focus:border-ring disabled:opacity-50"
                >
                  {(Object.keys(STAFF_RANK) as StaffRole[])
                    .sort((a, b) => STAFF_RANK[b] - STAFF_RANK[a])
                    .map((r) => (
                      <option key={r} value={r} disabled={!grantable.includes(r)}>
                        {t(`role${r}` as never)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Las acciones con su nombre escrito. Eran una llave y un escudo
                  tachado sin texto, y el escudo -- en rojo -- quitaba a la
                  persona del equipo. Sólo aparecen donde se pueden usar: en tu
                  propia fila eran dos iconos grises que no hacían nada. */}
              {editable && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const next = window.prompt(
                        t("staffPasswordPrompt")
                          .replace("{who}", m.email)
                          .replace("{n}", String(MIN_PASSWORD)),
                      );
                      if (next === null) return;
                      if (next.length < MIN_PASSWORD) {
                        toast.error(
                          t("staffPasswordTooShort").replace("{n}", String(MIN_PASSWORD)),
                        );
                        return;
                      }
                      resetPassword.mutate({ id: m.id, password: next });
                    }}
                    disabled={busy}
                    aria-label={`${t("staffNewPassword")}: ${m.email}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs disabled:opacity-40"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> {t("staffPasswordShort")}
                  </button>

                  {/* Sólo pregunta la baja. Reactivar a alguien no rompe nada, y
                      un aviso delante de cada acción enseña a pulsar "sí" sin
                      leerlo -- que es como se pierde la que sí importaba. */}
                  {m.active ? (
                    <ConfirmButton
                      title={t("confirmRemoveStaff").replace("{who}", m.email)}
                      description={t("confirmRemoveStaffBody")}
                      confirmLabel={t("confirmRemoveStaffCta")}
                      onConfirm={() => update.mutate({ id: m.id, body: { active: false } })}
                      disabled={busy}
                      aria-label={`${t("confirmRemoveStaffCta")}: ${m.email}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-destructive/60 px-3 text-xs text-destructive disabled:opacity-40"
                    >
                      <ShieldOff className="h-3.5 w-3.5" /> {t("confirmRemoveStaffCta")}
                    </ConfirmButton>
                  ) : (
                    <button
                      onClick={() => update.mutate({ id: m.id, body: { active: true } })}
                      disabled={busy}
                      aria-label={`${t("staffReactivate")}: ${m.email}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs disabled:opacity-40"
                    >
                      {t("staffReactivate")}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!list.isLoading && rows.length === 1 && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Sólo estás tú. Añade a tu equipo para que cada quien entre con su propia cuenta: así las
          propinas y los cobros quedan a nombre de quien los hizo.
        </p>
      )}
    </section>
  );
}
