import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth, staffSession } from "@/lib/api";
import { publicStrings } from "@/lib/i18n-public";

export const Route = createFileRoute("/restablecer")({
  head: () => ({
    meta: [{ title: "Contraseña nueva — Splite" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPassword,
});

/**
 * El enlace del correo: elegir la contraseña nueva.
 *
 * El token llega en el fragmento (`#...`), que el navegador no manda al
 * servidor. Se lee una vez y se borra de la barra de direcciones, como en las
 * invitaciones, para que no se quede en el historial ni en una captura.
 *
 * Al guardar, el servidor cierra todas las sesiones de la cuenta -- también la
 * de este navegador si la había --, y no abre otra: se vuelve a entrar con la
 * contraseña nueva (y el segundo factor, si lo hay).
 */
function ResetPassword() {
  const { t } = useI18n(publicStrings);
  const [token, setToken] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<"mismatch" | "invalid" | "short" | "other" | null>(null);

  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    if (fromHash) window.history.replaceState(null, "", window.location.pathname);
    setToken(/^[A-Za-z0-9_-]{43}$/.test(fromHash) ? fromHash : null);
    setRead(true);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (password !== repeat) return setError("mismatch");
    if (password.length < 12) return setError("short");
    setPending(true);
    setError(null);
    try {
      await auth.resetPassword(token, password);
      // Las sesiones de esta cuenta ya no valen: lo que hubiera guardado aquí, tampoco.
      staffSession.set(null);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "PASSWORD_RESET_INVALID"
          ? "invalid"
          : err instanceof ApiError && err.status === 400
            ? "short"
            : "other",
      );
    } finally {
      setPending(false);
    }
  }

  const body = !read ? null : done ? (
    <div role="status" data-testid="reset-done">
      <h1 className="text-3xl">{t("resetDoneTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("resetDoneBody")}</p>
      <Link
        to="/login"
        className="mt-6 block w-full rounded-full bg-primary px-6 py-3 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("enter")}
      </Link>
    </div>
  ) : !token || error === "invalid" ? (
    <div role="alert" data-testid="reset-invalid">
      <h1 className="text-3xl">{t("resetTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {token ? t("resetInvalid") : t("resetNoToken")}
      </p>
      <Link
        to="/olvide"
        className="mt-6 block w-full rounded-full bg-primary px-6 py-3 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("resetAskAgain")}
      </Link>
    </div>
  ) : (
    <form method="post" onSubmit={submit}>
      <h1 className="text-3xl">{t("resetTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("resetSub")}</p>

      <label
        htmlFor="reset-password"
        className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground"
      >
        {t("resetNew")}
      </label>
      <input
        id="reset-password"
        name="password"
        type="password"
        required
        autoFocus
        minLength={12}
        maxLength={128}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
      />
      <p className="hint mt-1">{t("resetHint")}</p>

      <label
        htmlFor="reset-repeat"
        className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground"
      >
        {t("resetRepeat")}
      </label>
      <input
        id="reset-repeat"
        name="repeat"
        type="password"
        required
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
      />

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-sm">
            {error === "mismatch"
              ? t("resetMismatch")
              : error === "short"
                ? t("resetHint")
                : t("authGeneric")}
          </p>
        </div>
      )}

      <button
        data-testid="reset-submit"
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t("loading") : t("resetSave")}
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Link to="/" className="font-display text-2xl">
          {t("brand")}
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <div className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]">{body}</div>
      </main>
    </div>
  );
}
