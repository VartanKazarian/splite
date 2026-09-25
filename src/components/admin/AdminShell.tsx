import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { operatorSession, type OperatorSession } from "@/lib/adminApi";

/**
 * El marco de la consola: quién está dentro, las tres secciones y salir.
 *
 * Sin sesión de operador no pinta nada y lleva al login. La comprobación de
 * verdad la hace el servidor en cada petición; esto sólo evita enseñar una
 * pantalla vacía que luego falla.
 */
export function AdminShell({
  current,
  children,
}: {
  current: "resumen" | "clientes" | "cobros" | "altas" | "precios";
  children: (session: OperatorSession) => React.ReactNode;
}) {
  const navigate = useNavigate();
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const s = operatorSession.get();
    setSession(s);
    setChecked(true);
    if (!s) void navigate({ to: "/admin/login" });
  }, [navigate]);

  if (!checked || !session) return null;

  const tabs = [
    ["clientes", "/admin", "Clientes"],
    ["cobros", "/admin/cobros", "Cobros"],
    ["altas", "/admin/altas", "Altas"],
    ["resumen", "/admin/resumen", "Resumen"],
    ["precios", "/admin/precios", "Precios"],
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link to="/admin" className="text-[15px] font-semibold tracking-[0.14em]">
            SPLITE{" "}
            <span className="font-normal tracking-normal text-muted-foreground">· Consola</span>
          </Link>
          <nav className="flex flex-wrap gap-1" aria-label="Consola">
            {tabs.map(([id, to, label]) => (
              <Link
                key={id}
                to={to}
                aria-current={current === id ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm transition-colors ${
                  current === id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground" data-testid="admin-operator">
              {session.operator.displayName}
              <span className="ml-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]">
                {session.operator.role === "ADMIN" ? "Admin" : "Soporte"}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                operatorSession.clear();
                void navigate({ to: "/admin/login" });
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-8">{children(session)}</main>
    </div>
  );
}
