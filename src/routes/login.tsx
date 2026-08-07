import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import { signIn } from "@/lib/auth";
import { restaurant } from "@/lib/mock-data";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar al panel — Mesa" },
      {
        name: "description",
        content: "Acceso del restaurante al panel de mesas, QR y pagos de Mesa.",
      },
      { property: "og:title", content: "Entrar al panel — Mesa" },
      { property: "og:description", content: "Panel de mesas, QR y pagos para restaurantes." },
    ],
  }),
  component: Login,
});

function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("gerencia@lacava.ve");
  const [password, setPassword] = useState("demo1234");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Link to="/" className="font-display text-2xl">
          {t("brand")}
        </Link>
        <LangToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn(email);
            navigate({ to: "/dashboard" });
          }}
          className="surface w-full max-w-sm p-8 shadow-[var(--shadow-glow)]"
        >
          <h1 className="text-3xl">{t("login")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("loginSub")} · {restaurant.name}
          </p>

          <label className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground">
            {t("email")}
          </label>
          <input
            type="email"
            required
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
          />

          <button
            type="submit"
            className="mt-6 w-full rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("enter")}
          </button>
          <p className="mt-4 text-center text-xs text-muted-foreground">{t("demoNote")}</p>
        </form>
      </main>
    </div>
  );
}
