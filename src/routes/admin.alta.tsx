import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { admin, operatorSession } from "@/lib/adminApi";
import { adminHead } from "@/lib/adminHead";
import { QrCode } from "@/components/QrCode";

export const Route = createFileRoute("/admin/alta")({
  head: adminHead("Alta"),
  component: AdminSetup,
});

/**
 * El alta de un operador, desde el enlace que imprime `npm run operator`.
 *
 * El token viaja en el fragmento (#...), que el navegador no manda a ningún
 * servidor ni deja en los registros. Tres cosas en una pantalla: vincular el
 * autenticador, elegir la contraseña y demostrar con un código que quedó
 * vinculado. Sin el código no hay cuenta: el segundo factor no es opcional.
 */
function AdminSetup() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ email: string; secret: string; otpauthUri: string } | null>(
    null,
  );
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.location.hash.replace(/^#/, "");
    // Fuera de la barra de direcciones en cuanto se lee: que no se quede en el
    // historial ni en una captura de pantalla.
    window.history.replaceState(null, "", window.location.pathname);
    if (!t) {
      setInvalid(true);
      return;
    }
    setToken(t);
    admin
      .setupStart(t)
      .then(setInfo)
      .catch(() => setInvalid(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const s = await admin.setupComplete(token, password, code.trim());
      operatorSession.set(s);
      void navigate({ to: "/admin" });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "MFA_CODE_INVALID"
          ? "Ese código no vale. Revisa que el autenticador tenga la cuenta de Splite y prueba con el código actual."
          : err instanceof ApiError && err.status === 400
            ? "La contraseña necesita al menos 14 caracteres."
            : err instanceof ApiError && err.status === 404
              ? "Este enlace ya no vale. Pide uno nuevo."
              : "No se pudo conectar con el servidor.",
      );
      setCode("");
    } finally {
      setPending(false);
    }
  }

  if (invalid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="surface max-w-sm p-6" role="alert">
          <h1 className="text-xl">Enlace no válido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Caducó, ya se usó o está incompleto. Pide a un administrador que ejecute{" "}
            <code className="rounded bg-secondary px-1">npm run operator -- reset tu@correo</code>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <form onSubmit={submit} className="surface w-full max-w-md p-6" data-testid="admin-setup">
        <p className="text-[13px] font-semibold tracking-[0.14em]">
          SPLITE{" "}
          <span className="font-normal tracking-normal text-muted-foreground">· Consola</span>
        </p>
        <h1 className="mt-3 text-2xl">Activa tu acceso</h1>
        {!info ? (
          <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{info.email}</p>

            <h2 className="mt-6 text-sm font-medium">1. Vincula tu autenticador</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Escanea el código con Google Authenticator, 1Password, Authy o similar.
            </p>
            <div className="mt-3 flex justify-center rounded-xl bg-white p-3">
              <QrCode value={info.otpauthUri} size={200} />
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer">¿No puedes escanear? Clave manual</summary>
              <code className="mt-1 block break-all rounded bg-secondary p-2">{info.secret}</code>
            </details>

            <h2 className="mt-6 text-sm font-medium">2. Elige tu contraseña</h2>
            <div className="mt-2 grid gap-2">
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Al menos 14 caracteres"
                minLength={14}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Contraseña"
                className="min-h-11 rounded-lg border border-input bg-background px-3 outline-none focus:border-ring"
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Repítela"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                aria-label="Repite la contraseña"
                className="min-h-11 rounded-lg border border-input bg-background px-3 outline-none focus:border-ring"
              />
            </div>

            <h2 className="mt-6 text-sm font-medium">3. Escribe el código que muestra</h2>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Código del autenticador"
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 tracking-[0.3em] outline-none focus:border-ring"
            />

            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn-primary mt-5 w-full">
              {pending ? "Activando…" : "Activar y entrar"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
