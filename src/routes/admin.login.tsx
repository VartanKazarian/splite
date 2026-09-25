import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { admin, operatorSession } from "@/lib/adminApi";
import { adminHead } from "@/lib/adminHead";

export const Route = createFileRoute("/admin/login")({
  head: adminHead("Entrar"),
  component: AdminLogin,
});

/**
 * Entrar a la consola: correo, contraseña y el código del autenticador, todo
 * junto. No hay "¿olvidaste la contraseña?": se rehace el alta desde la línea
 * de comandos, que es a propósito el único sitio donde se crean accesos.
 */
function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (operatorSession.get()) void navigate({ to: "/admin" });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const s = await admin.login(email.trim(), password, code.trim());
      operatorSession.set(s);
      void navigate({ to: "/admin" });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Correo, contraseña o código incorrectos."
          : err instanceof ApiError && err.status === 429
            ? "Demasiados intentos. Espera unos minutos."
            : "No se pudo conectar con el servidor.",
      );
      setCode("");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <form onSubmit={submit} className="surface w-full max-w-sm p-6" data-testid="admin-login">
        <p className="text-[13px] font-semibold tracking-[0.14em]">
          SPLITE{" "}
          <span className="font-normal tracking-normal text-muted-foreground">· Consola</span>
        </p>
        <h1 className="mt-3 text-2xl">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sólo para el equipo de Splite.</p>
        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm">
            Correo
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 rounded-lg border border-input bg-background px-3 outline-none focus:border-ring"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 rounded-lg border border-input bg-background px-3 outline-none focus:border-ring"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Código del autenticador
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="min-h-11 rounded-lg border border-input bg-background px-3 tracking-[0.3em] outline-none focus:border-ring"
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn-primary mt-5 w-full">
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
