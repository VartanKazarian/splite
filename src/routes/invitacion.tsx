import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { ApiError, auth, type InvitationPreview } from "@/lib/api";

export const Route = createFileRoute("/invitacion")({
  head: () => ({
    meta: [
      { title: "Únete al equipo — Splite" },
      // Un enlace personal: no tiene nada que hacer en un buscador.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcceptInvitation,
});

/** Lo mismo que exige el servidor; decirlo antes ahorra un viaje. */
const MIN_PASSWORD = 12;

/**
 * Aceptar una invitación al equipo.
 *
 * El token llega en el fragmento del enlace (`#...`), que el navegador nunca
 * manda a ningún servidor. Se lee una vez al montar y se borra de la barra de
 * direcciones: así no queda en el historial ni en una captura de pantalla de
 * alguien que ya entró.
 */
function AcceptInvitation() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "error">("loading");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    if (fromHash) window.history.replaceState(null, "", window.location.pathname);
    if (!/^[A-Za-z0-9_-]{43}$/.test(fromHash)) {
      setState("invalid");
      return;
    }
    setToken(fromHash);
    auth
      .previewInvitation(fromHash)
      .then((p) => {
        setPreview(p);
        setState("ready");
      })
      .catch((e) => setState(e instanceof ApiError && e.status === 404 ? "invalid" : "error"));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError(t("inviteAcceptMismatch"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await auth.acceptInvitation({ token, password, displayName: name.trim() || null });
      navigate({ to: "/dashboard" });
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVITATION_EMAIL_IN_USE") {
        setError(t("inviteAcceptEmailInUse"));
      } else if (e instanceof ApiError && e.code === "INVITATION_INVALID") {
        setState("invalid");
      } else {
        setError(t("apiUnreachable"));
      }
    } finally {
      setPending(false);
    }
  }

  const roleName = preview ? t(`role${preview.role}` as never) : "";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Link to="/" className="font-display text-2xl">
          {t("brand")}
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <div className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]">
          {state === "loading" && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

          {state === "invalid" && (
            <div data-testid="invite-invalid">
              <h1 className="text-2xl">{t("inviteInvalidTitle")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("inviteInvalidBody")}</p>
              <Link to="/login" className="btn-primary mt-6 w-full">
                {t("inviteGoToLogin")}
              </Link>
            </div>
          )}

          {state === "error" && (
            <div>
              <h1 className="text-2xl">{t("inviteErrorTitle")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("apiUnreachable")}</p>
            </div>
          )}

          {state === "ready" && preview && (
            <form method="post" onSubmit={submit} data-testid="invite-form">
              <p className="eyebrow">{preview.restaurantName}</p>
              <h1 className="mt-1 text-2xl">{t("inviteTitle")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("inviteBody").replace("{role}", roleName)}
              </p>
              <p className="mt-1 break-all text-sm">{preview.email}</p>

              <label htmlFor="invite-name" className="field-label mt-6 block">
                {t("inviteName")}
              </label>
              <input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
              />
              <p className="hint mt-1">{t("inviteNameHint")}</p>

              <label htmlFor="invite-password" className="field-label mt-4 block">
                {t("invitePassword").replace("{n}", String(MIN_PASSWORD))}
              </label>
              <input
                id="invite-password"
                type="password"
                required
                minLength={MIN_PASSWORD}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
              />

              <label htmlFor="invite-confirm" className="field-label mt-4 block">
                {t("inviteConfirm")}
              </label>
              <input
                id="invite-confirm"
                type="password"
                required
                minLength={MIN_PASSWORD}
                maxLength={128}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
              />

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={pending || password.length < MIN_PASSWORD}
                data-testid="invite-accept"
                className="btn-primary mt-6 w-full"
              >
                {pending ? t("loading") : t("inviteAccept")}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
