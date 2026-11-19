import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth } from "@/lib/api";
import "@/lib/i18n-public";

export const Route = createFileRoute("/olvide")({
  head: () => ({
    meta: [{ title: "Restablecer contraseña — Splite" }, { name: "robots", content: "noindex" }],
  }),
  component: ForgotPassword,
});

/**
 * «¿Olvidaste tu contraseña?»: pedir el enlace.
 *
 * El servidor contesta igual exista o no la cuenta, así que la pantalla
 * también: «si tiene cuenta, te llegará». Decir «no existe» sería contarle a
 * cualquiera qué correos están dados de alta.
 */
function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failed, setFailed] = useState<"invalid" | "other" | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Del formulario y no del estado: si alguien escribe antes de que la página
    // termine de cargar (un teléfono lento), el estado no se entera y se
    // mandaría el correo vacío.
    const typed = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setEmail(typed);
    setPending(true);
    setFailed(null);
    try {
      await auth.forgotPassword(typed);
      setSentTo(typed);
    } catch (err) {
      setFailed(err instanceof ApiError && err.status === 400 ? "invalid" : "other");
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
        <div className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]">
          {sentTo ? (
            <div role="status" data-testid="forgot-sent">
              <h1 className="text-3xl">{t("forgotSentTitle")}</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("forgotSentBody").replace("{email}", sentTo)}
              </p>
              <Link
                to="/login"
                className="mt-6 block w-full rounded-full bg-primary px-6 py-3 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("forgotBack")}
              </Link>
            </div>
          ) : (
            <form method="post" onSubmit={submit}>
              <h1 className="text-3xl">{t("forgotTitle")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("forgotSub")}</p>

              <label
                htmlFor="forgot-email"
                className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground"
              >
                {t("email")}
              </label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
              />

              {failed && (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-sm">
                    {failed === "invalid" ? t("authBadEmail") : t("authGeneric")}
                  </p>
                </div>
              )}

              <button
                data-testid="forgot-submit"
                type="submit"
                disabled={pending}
                className="mt-6 w-full rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending ? t("loading") : t("forgotSend")}
              </button>

              <Link
                to="/login"
                className="mt-4 block text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t("forgotBack")}
              </Link>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
