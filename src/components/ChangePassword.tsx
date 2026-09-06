import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth, errorFields } from "@/lib/api";

/** El mínimo del servidor. Decirlo antes ahorra un viaje y un 400. */
const MIN_PASSWORD = 12;

/**
 * Cambiar la propia contraseña.
 *
 * Hasta ahora la única forma de tener una contraseña nueva era que el dueño o
 * un encargado te la pusiera, así que la provisional que te daban al darte de
 * alta la sabíais los dos para siempre. Cualquiera con cuenta puede usar esto,
 * incluido el dueño.
 *
 * El endpoint responde con una sesión nueva y el cliente la guarda: cambiar la
 * contraseña revoca todos los refresh tokens de la persona, también el de este
 * navegador. Sin guardarla, quien acaba de hacer lo correcto se vería expulsado
 * en la siguiente renovación.
 */
export function ChangePassword() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setCurrent("");
    setNext("");
    setRepeat("");
    setFieldErrors({});
  };

  const change = useMutation({
    mutationFn: () => auth.changePassword(current, next),
    onSuccess: (res) => {
      reset();
      setOpen(false);
      toast.success(
        res.sessionsRevoked > 0
          ? t("pwChangedWithSessions").replace("{count}", String(res.sessionsRevoked))
          : t("pwChanged"),
      );
    },
    onError: (error: unknown) => {
      if (!(error instanceof ApiError)) return toast.error(t("apiDown"));
      if (error.code === "INVALID_CREDENTIALS")
        // El servidor no distingue "contraseña actual mal" de otras causas en
        // este código; aquí sólo puede ser eso, porque la sesión ya vale.
        return toast.error(t("pwCurrentWrong"));
      if (error.code === "PASSWORD_UNCHANGED") return toast.error(t("pwUnchanged"));
      if (error.code === "VALIDATION_FAILED") {
        setFieldErrors(errorFields(error));
        return toast.error(error.message);
      }
      return toast.error(`${error.code} · ${error.message}`);
    },
  });

  // Se comprueba aquí y no se manda: el servidor no recibe la repetición, es
  // sólo para que no se cambie a una contraseña que se ha escrito mal.
  const mismatch = repeat.length > 0 && next !== repeat;
  const ready = current.length > 0 && next.length >= MIN_PASSWORD && next === repeat;

  return (
    <section className="surface mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-xl">
          <KeyRound className="h-5 w-5 text-muted-foreground" /> {t("pwTitle")}
        </h2>
        <button
          onClick={() => {
            setOpen((v) => !v);
            reset();
          }}
          className="min-h-11 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-secondary"
        >
          {open ? t("cancel") : t("pwChangeIt")}
        </button>
      </div>

      {!open && <p className="mt-2 text-sm text-muted-foreground">{t("pwWhy")}</p>}

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
          className="mt-4 grid gap-3"
        >
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">{t("pwCurrent")}</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              maxLength={128}
              autoComplete="current-password"
              className="min-h-11 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
            />
            {fieldErrors["currentPassword"] && (
              <span className="text-[11px] text-destructive">{fieldErrors["currentPassword"]}</span>
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">
                {t("pwNew").replace("{min}", String(MIN_PASSWORD))}
              </span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={MIN_PASSWORD}
                maxLength={128}
                autoComplete="new-password"
                className="min-h-11 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:border-ring"
              />
              {fieldErrors["newPassword"] && (
                <span className="text-[11px] text-destructive">{fieldErrors["newPassword"]}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">{t("pwRepeat")}</span>
              <input
                type="password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                required
                maxLength={128}
                autoComplete="new-password"
                aria-invalid={mismatch}
                className={`min-h-11 rounded-lg border bg-secondary px-3 text-sm outline-none focus:border-ring ${
                  mismatch ? "border-destructive" : "border-input"
                }`}
              />
              {mismatch && <span className="text-[11px] text-destructive">{t("pwMismatch")}</span>}
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">{t("pwSessionsNote")}</p>

          <div>
            <button
              type="submit"
              disabled={!ready || change.isPending}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm text-primary-foreground disabled:opacity-60"
            >
              {change.isPending ? t("loading") : t("pwSubmit")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
