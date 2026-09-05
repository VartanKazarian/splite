import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth, isMfaChallenge, staffSession } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar al panel — Splite" },
      {
        name: "description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Entrar al panel — Splite" },
      {
        property: "og:description",
        content:
          "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  /**
   * El reto cuando la cuenta tiene segundo factor.
   *
   * Mientras esto vale, la contraseña ya se comprobó y todavía no hay sesión:
   * el login está a medias. Caduca, así que si alguien deja la pantalla abierta
   * el servidor rechaza el código y se vuelve a empezar.
   */
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ code: string; message: string; requestId: string } | null>(
    null,
  );

  useEffect(() => {
    if (staffSession.get()) navigate({ to: "/dashboard" });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await auth.login(email, password);
      // Con segundo factor no llega sesión, llega un reto. Navegar aquí sería
      // mandar al panel a alguien que no tiene tokens, y el panel lo devolvería
      // al login: la cuenta quedaría inaccesible por haberse protegido mejor.
      if (isMfaChallenge(result)) {
        setChallenge(result.challenge);
        setCode("");
        return;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code, message: err.message, requestId: err.requestId });
      } else {
        setError({ code: "NETWORK_ERROR", message: t("apiDown"), requestId: "" });
      }
    } finally {
      setPending(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setPending(true);
    setError(null);
    try {
      await auth.completeMfaLogin(challenge, code.trim());
      navigate({ to: "/dashboard" });
    } catch (err) {
      if (err instanceof ApiError) {
        // El servidor responde lo mismo a un código malo, a un reto caducado y
        // a uno ya gastado, a propósito: distinguirlos le diría a quien tiene la
        // contraseña contra qué secreto está probando. Cuando el reto ya no
        // sirve, lo honesto es devolver a la contraseña.
        setError({ code: err.code, message: err.message, requestId: err.requestId });
        if (err.code === "INVALID_CREDENTIALS") setCode("");
      } else {
        setError({ code: "NETWORK_ERROR", message: t("apiDown"), requestId: "" });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Link to="/" className="font-display text-2xl">
          {t("brand")}
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        {challenge ? (
          <form
            method="post"
            onSubmit={submitCode}
            className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]"
          >
            <h1 className="text-3xl">Código de verificación</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Abre tu app de autenticación y escribe el código de seis dígitos. También sirve uno de
              tus códigos de recuperación.
            </p>

            <label
              htmlFor="login-code"
              className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground"
            >
              Código
            </label>
            <input
              id="login-code"
              name="code"
              required
              autoFocus
              // Ni `type="number"` ni un patrón de seis dígitos: un código de
              // recuperación se escribe en este mismo campo y no es numérico.
              inputMode="text"
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-ring"
            />

            {error && <AuthError code={error.code} step="code" />}

            <button
              type="submit"
              disabled={pending || code.trim().length === 0}
              className="mt-6 w-full rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? t("loading") : t("enter")}
            </button>

            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setCode("");
                setError(null);
                setPassword("");
              }}
              className="mt-3 w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Volver
            </button>
          </form>
        ) : (
          <form
            method="post"
            onSubmit={submit}
            className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]"
          >
            <h1 className="text-3xl">{t("login")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("loginSub")}</p>

            <label
              htmlFor="login-email"
              className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground"
            >
              {t("email")}
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
            />

            <label
              htmlFor="login-password"
              className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground"
            >
              {t("password")}
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
            />

            {error && <AuthError code={error.code} step="password" />}

            <button
              type="submit"
              disabled={pending}
              className="mt-6 w-full rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? t("loading") : t("enter")}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

/**
 * Lo que se le dice a alguien que no consigue entrar.
 *
 * Escribir mal la contraseña es el error más común que existe, y aquí se
 * contestaba con `INVALID_CREDENTIALS`, el mensaje del backend en inglés y el
 * identificador de la petición -- en la primera pantalla que ve un
 * restaurante, antes de haber entrado nunca.
 *
 * El mismo código significa dos cosas según el paso: en la contraseña, que la
 * pareja correo/contraseña no vale; en el código de dos pasos, que ese código
 * no sirve. Por eso `step`.
 *
 * Ni código ni identificador de petición: aquí no hay nadie a quien
 * dárselos. Siguen en la respuesta y en los logs del servidor.
 */
function AuthError({ code, step }: { code: string; step: "password" | "code" }) {
  const { t } = useI18n();
  const message =
    code === "INVALID_CREDENTIALS"
      ? step === "code"
        ? t("authBadCode")
        : t("authBadCredentials")
      : t("authGeneric");
  return (
    <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <p className="text-sm">{message}</p>
    </div>
  );
}
