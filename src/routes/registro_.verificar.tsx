import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { ApiError, onboarding } from "@/lib/api";
import { LangToggle } from "@/components/LangToggle";
import { useI18n, type Key } from "@/lib/i18n";
import { publicStrings } from "@/lib/i18n-public";

type Search = { token?: string };

/**
 * El final del registro: se elige la contraseña y nace la cuenta.
 *
 * El equipo llama al restaurante, corre `npm run onboarding -- invite <id>` y
 * el correo trae un enlace a esta página con un token de un solo uso. Hasta
 * ahora ese enlace no llevaba a ninguna parte -- el correo salía, el
 * restaurante hacía clic y caía en un 404.
 *
 * El token viaja en la URL y es la credencial: quien lo tiene puede crear el
 * inquilino. Por eso no se guarda, no se registra en ningún log y no se enseña
 * en pantalla; sólo se manda una vez, en el envío.
 */
/*
 * `registro_.verificar.tsx`, con guion bajo, y no `registro.verificar.tsx`.
 *
 * La URL es la misma -- /registro/verificar -- pero el guion bajo la saca de
 * dentro de `registro.tsx`. Sin él esta pantalla sería hija del formulario de
 * solicitud, que no tiene `<Outlet />`: la ruta existiría, el enlace del correo
 * llevaría a ella, y no se pintaría nada. El mismo callejón sin salida que esto
 * viene a arreglar, sólo que en blanco en vez de un 404.
 */
export const Route = createFileRoute("/registro_/verificar")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Activa tu cuenta — Splite" },
      {
        name: "description",
        content: "Elige tu contraseña y activa la cuenta de tu restaurante en Splite.",
      },
      // Un enlace de un solo uso no debe acabar en un índice de búsqueda.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Verificar,
});

/** Lo que exige el servidor (onboardingVerifySchema). Repetido aquí para decirlo antes. */
const MIN_PASSWORD = 12;

function Verificar() {
  const { t } = useI18n(publicStrings);
  const { token } = Route.useSearch();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; requestId?: string } | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !pending && password.length >= MIN_PASSWORD && confirm === password;

  /**
   * Sin token no hay nada que enviar, así que no se enseña el formulario.
   *
   * Pedir una contraseña que no se puede canjear sería hacerle escribir a
   * alguien algo que vamos a tirar, y luego darle un error que parece culpa
   * suya.
   */
  if (!token) {
    return (
      <Shell>
        <h1 className="text-3xl">{t("verifyMissingTitle")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("verifyMissingBody")}</p>
        <p className="mt-3 text-sm text-muted-foreground">{t("verifyMissingHelp")}</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full border border-border px-5 py-3 text-sm"
        >
          {t("verifyBackHome")}
        </Link>
      </Shell>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !canSubmit) return;

    setPending(true);
    setError(null);
    try {
      await onboarding.verify(token, password);
      // La sesión ya quedó guardada por el cliente, así que se entra directo.
      navigate({ to: "/dashboard" });
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setError({ text: t("verifyErrNetwork") });
        return;
      }
      setError({
        text: t(messageKey(err)).replace("{min}", String(MIN_PASSWORD)),
        ...(err.requestId ? { requestId: err.requestId } : {}),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-3xl">{t("verifyTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("verifySub")}</p>

      <form method="post" onSubmit={submit} className="mt-6">
        <label
          htmlFor="verify-password"
          className="block text-xs uppercase tracking-widest text-muted-foreground"
        >
          {t("password")}
        </label>
        <input
          id="verify-password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="verify-password-hint"
          className={`mt-2 w-full rounded-lg border bg-secondary px-4 py-3 text-sm outline-none focus:border-ring ${
            tooShort ? "border-destructive" : "border-input"
          }`}
        />
        <p id="verify-password-hint" className="mt-2 text-xs text-muted-foreground">
          {tooShort
            ? t("verifyPasswordShort").replace("{n}", String(MIN_PASSWORD - password.length))
            : t("verifyPasswordMin").replace("{min}", String(MIN_PASSWORD))}
        </p>

        <label
          htmlFor="verify-confirm"
          className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground"
        >
          {t("verifyConfirm")}
        </label>
        <input
          id="verify-confirm"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          {...(mismatch ? { "aria-describedby": "verify-confirm-error" } : {})}
          className={`mt-2 w-full rounded-lg border bg-secondary px-4 py-3 text-sm outline-none focus:border-ring ${
            mismatch ? "border-destructive" : "border-input"
          }`}
        />
        {/*
          La confirmación se comprueba aquí y no en el servidor a propósito: es
          un error de mecanografía, no una regla del sistema, y el enlace es de
          un solo uso -- gastarlo en una contraseña mal escrita dejaría al
          restaurante sin forma de entrar y con la cuenta ya creada.
        */}
        {mismatch && (
          <p id="verify-confirm-error" className="mt-2 text-xs text-destructive">
            {t("verifyMismatch")}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
            <p className="text-muted-foreground">{error.text}</p>
            {error.requestId && (
              <p className="mt-1 break-all text-[11px] text-muted-foreground">
                {t("verifyReference")}: {error.requestId}
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-6 w-full rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("verifySubmitting") : t("verifySubmit")}
        </button>
      </form>
    </Shell>
  );
}

/**
 * Qué decirle a un restaurante por cada código del servidor.
 *
 * Sin el código, al revés que la pantalla de entrar: allí quien
 * mira es del equipo y el código ayuda; aquí es alguien que abrió un correo y
 * para quien `ONBOARDING_TOKEN_INVALID` no significa nada. El requestId sí se
 * enseña, porque es lo único que sirve si acaba escribiéndonos.
 */
function messageKey(err: ApiError): Key {
  switch (err.code) {
    case "ONBOARDING_TOKEN_INVALID":
      return "verifyErrTokenInvalid";
    case "VALIDATION_FAILED":
      return "verifyErrPassword";
    case "RATE_LIMITED":
      return "verifyErrRateLimited";
    case "RATE_LIMITER_UNAVAILABLE":
      return "verifyErrUnavailable";
    case "ONBOARDING_NOT_CONFIGURED":
      return "verifyErrNotConfigured";
    // Sólo pueden aparecer si alguien se registró entre la invitación y este
    // envío: inviteLead ya los comprueba, y esto es la carrera intermedia.
    case "EMAIL_ALREADY_REGISTERED":
    case "RIF_ALREADY_REGISTERED":
      return "verifyErrExists";
    default:
      return "verifyErrGeneric";
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Link to="/" className="font-display text-2xl">
          Splite
        </Link>
        <LangToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <div className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]">{children}</div>
      </main>
    </div>
  );
}
