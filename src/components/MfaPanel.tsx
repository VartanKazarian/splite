import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { ApiError, auth } from "@/lib/api";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useI18n } from "@/lib/i18n";

/**
 * El segundo factor de quien está mirando, y de nadie más.
 *
 * Nada aquí toca la cuenta de otra persona, ni siquiera siendo dueño: un
 * encargado que pudiera quitarle el segundo factor a un colega podría quedarse
 * con su cuenta. El backend lo impone; esta pantalla ni lo ofrece.
 *
 * Tres estados, y el del medio es el que importa: entre `enrol` y `confirm` el
 * secreto existe pero no está activo. Si alguien cierra la pestaña ahí, no pasa
 * nada -- no se ha activado, y volver a empezar da un secreto nuevo.
 */
export function MfaPanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  /**
   * Que el servidor no tiene clave para guardar segundos factores.
   *
   * No se puede saber de antemano: `GET /auth/mfa` responde 200 y
   * `enabled: false` aunque falte la clave -- que es correcto, porque es la
   * verdad sobre esta cuenta. Sólo se sabe al intentar activarlo. Así que se
   * recuerda ese 503 y se cambia el mensaje, en vez de dejar un botón que
   * siempre va a fallar.
   */
  const [keyMissing, setKeyMissing] = useState(false);

  const status = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => auth.mfa.status(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["mfa-status"] });

  const fail = (error: unknown) => {
    if (!(error instanceof ApiError)) return toast.error("No se pudo conectar con el servidor");
    const say: Record<string, string> = {
      MFA_CODE_INVALID: "Ese código no vale. Prueba con el siguiente que salga.",
      MFA_ALREADY_ENABLED: "Ya lo tienes activado",
      MFA_NOT_ENABLED: "No lo tienes activado",
      MFA_NOT_ENROLLED: "Empieza de nuevo: no hay ningún secreto pendiente",
      MFA_KEY_MISSING:
        "El servidor no tiene configurada la clave para guardar segundos factores. Es una variable de entorno que falta, no algo que puedas arreglar desde aquí.",
      MFA_SECRET_UNREADABLE:
        "El servidor no pudo leer tu secreto. Habla con quien lleva el sistema.",
    };
    if (error.code === "MFA_KEY_MISSING") setKeyMissing(true);
    const known = say[error.code];
    if (known) return toast.error(known);
    return toast.error(`${error.code} · ${error.message}`);
  };

  const begin = useMutation({
    mutationFn: () => auth.mfa.enrol(),
    onSuccess: (r) => {
      setSecret(r);
      setCode("");
      setCodes(null);
    },
    onError: fail,
  });

  const confirm = useMutation({
    mutationFn: () => auth.mfa.confirm(code.trim()),
    onSuccess: (r) => {
      setSecret(null);
      setCode("");
      // Se enseñan una sola vez: el servidor guarda un hash, así que si se
      // cierra esta pantalla sin copiarlos ya no hay forma de volver a verlos.
      setCodes(r.recoveryCodes);
      toast.success("Segundo factor activado");
      refresh();
    },
    onError: fail,
  });

  const disable = useMutation({
    mutationFn: () => auth.mfa.disable(code.trim()),
    onSuccess: () => {
      setCode("");
      setCodes(null);
      toast.success("Segundo factor desactivado");
      refresh();
    },
    onError: fail,
  });

  const regenerate = useMutation({
    mutationFn: () => auth.mfa.regenerateRecoveryCodes(code.trim()),
    onSuccess: (r) => {
      setCode("");
      setCodes(r.recoveryCodes);
      toast.success("Códigos nuevos. Los anteriores ya no sirven.");
      refresh();
    },
    onError: fail,
  });

  const busy = begin.isPending || confirm.isPending || disable.isPending || regenerate.isPending;
  const unavailable =
    keyMissing || (status.error instanceof ApiError && status.error.code === "MFA_KEY_MISSING");
  const enabled = status.data?.enabled ?? false;

  const codeInput = (label: string) => (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        // Un código de recuperación también se escribe aquí y no es numérico.
        inputMode="text"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        className="min-h-11 rounded-lg border border-input bg-secondary px-3 text-center tracking-[0.3em] outline-none focus:border-ring"
      />
    </label>
  );

  return (
    <section className="surface mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-xl">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" /> Verificación en dos pasos
        </h2>
        {!status.isLoading && !unavailable && (
          <span className="text-xs text-muted-foreground">
            {enabled ? "Activada" : "Desactivada"}
          </span>
        )}
      </div>

      {status.isLoading && <p className="mt-2 text-sm text-muted-foreground">Cargando…</p>}

      {unavailable && (
        <p className="mt-2 text-sm text-muted-foreground">
          El servidor todavía no tiene configurada la clave con la que se guardan los segundos
          factores, así que esto no se puede activar. Falta una variable de entorno en el
          despliegue.
        </p>
      )}

      {!status.isLoading && !unavailable && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Además de la contraseña, un código de tu móvil. Protege tu cuenta aunque alguien
            averigüe la contraseña. Sólo afecta a la tuya: nadie puede activarla ni quitarla por ti.
          </p>

          {/* --- ya activada --- */}
          {enabled && !codes && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Te quedan {status.data?.recoveryCodesRemaining ?? 0} código(s) de recuperación.
              </p>
              {/* Dos acciones, un solo campo, y cada botón llama a la suya
                  directamente. La versión anterior ponía un estado en el onClick
                  y lo leía en el onSubmit del formulario -- React no lo ha
                  aplicado todavía en ese momento, así que «Desactivarla» podía
                  acabar generando códigos. */}
              <div className="grid gap-3 rounded-lg border border-border bg-secondary p-4 sm:max-w-sm">
                {codeInput("Código de tu app (o uno de recuperación)")}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => regenerate.mutate()}
                    disabled={busy || code.trim().length === 0}
                    className="min-h-11 rounded-lg bg-primary px-4 text-xs text-primary-foreground disabled:opacity-60"
                  >
                    {regenerate.isPending ? "Generando…" : "Códigos de recuperación nuevos"}
                  </button>
                  <ConfirmButton
                    title={t("confirmDisableMfa")}
                    description={t("confirmDisableMfaBody")}
                    confirmLabel={t("confirmDisableMfaCta")}
                    onConfirm={() => disable.mutate()}
                    disabled={busy || code.trim().length === 0}
                    className="min-h-11 rounded-lg border border-destructive/40 px-4 text-xs text-destructive disabled:opacity-60"
                  >
                    {disable.isPending ? "Desactivando…" : "Desactivarla"}
                  </ConfirmButton>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Generar códigos nuevos invalida la hoja anterior, que es el objetivo si crees que
                  alguien la tiene.
                </p>
              </div>
            </div>
          )}

          {/* --- activando: el secreto existe, todavía no vale --- */}
          {!enabled && secret && (
            <div className="mt-4 grid gap-3 rounded-lg border border-border bg-secondary p-4">
              <p className="text-sm">
                1. Añádelo a tu app de autenticación (Google Authenticator, 1Password, Aegis…).
              </p>
              <code className="block break-all rounded-lg bg-background px-3 py-2 text-xs">
                {secret.secret}
              </code>
              <a
                href={secret.otpauthUri}
                className="text-xs underline underline-offset-2"
                rel="noreferrer"
              >
                Abrir en la app
              </a>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  confirm.mutate();
                }}
                className="mt-2 grid gap-3 sm:max-w-xs"
              >
                {codeInput("2. Escribe el código que te muestra")}
                <div>
                  <button
                    type="submit"
                    disabled={busy || code.trim().length === 0}
                    className="min-h-11 rounded-lg bg-primary px-5 text-sm text-primary-foreground disabled:opacity-60"
                  >
                    {confirm.isPending ? "Activando…" : "Activar"}
                  </button>
                </div>
              </form>
              <p className="text-[11px] text-muted-foreground">
                Hasta que escribas un código válido no queda activada, así que puedes cerrar esto
                sin bloquearte.
              </p>
            </div>
          )}

          {/* --- desactivada y sin empezar --- */}
          {!enabled && !secret && !codes && (
            <div className="mt-4">
              <button
                onClick={() => begin.mutate()}
                disabled={busy}
                className="min-h-11 rounded-lg bg-primary px-5 text-sm text-primary-foreground disabled:opacity-60"
              >
                {begin.isPending ? "Preparando…" : "Activar"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Se enseñan una sola vez, pase lo que pase después. */}
      {codes && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
          <p className="text-sm">Guarda estos códigos de recuperación ahora.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Son la única forma de entrar si pierdes el móvil. No se pueden volver a ver: el servidor
            sólo guarda un resumen de cada uno. Cada código sirve una vez.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
            {codes.map((c) => (
              <li key={c} className="rounded bg-background px-2 py-1">
                {c}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setCodes(null)}
            className="mt-3 min-h-11 rounded-lg border border-border px-4 text-xs"
          >
            Ya los guardé
          </button>
        </div>
      )}
    </section>
  );
}
