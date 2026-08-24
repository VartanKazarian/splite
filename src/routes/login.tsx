import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth, staffSession } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar al panel — Splite" },
      {
        name: "description",
        content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.",
      },
      { property: "og:title", content: "Entrar al panel — Splite" },
      { property: "og:description", content: "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia." },
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
      await auth.login(email, password);
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Link to="/" className="font-display text-2xl">
          {t("brand")}
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <form onSubmit={submit} className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]">
          <h1 className="text-3xl">{t("login")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("loginSub")}</p>

          <label className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground">
            {t("email")}
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
          />

          <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">
            {t("password")}
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
          />

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <p className="font-medium text-destructive">{error.code}</p>
              <p className="mt-1 text-muted-foreground">{error.message}</p>
              {error.requestId && (
                <p className="mt-1 break-all text-[10px] text-muted-foreground">
                  {t("requestId")}: {error.requestId}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 w-full rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? t("loading") : t("enter")}
          </button>
        </form>
      </main>
    </div>
  );
}
