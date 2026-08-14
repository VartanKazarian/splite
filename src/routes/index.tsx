import { createFileRoute, Link } from "@tanstack/react-router";
import { QrCode as QrIcon, SplitSquareHorizontal, Wallet, Plug } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { QrCode } from "@/components/QrCode";
import { useI18n } from "@/lib/i18n";
import { restaurant } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Divide y paga la cuenta del restaurante con un QR" },
      {
        name: "description",
        content:
          "Pay at table para restaurantes: QR por mesa, división de cuenta, propina y pago con Pago Móvil o tarjeta.",
      },
      { property: "og:title", content: "Divide y paga la cuenta del restaurante con un QR" },
      {
        property: "og:description",
        content: "Pay at table para restaurantes: QR por mesa, división de cuenta, propina y pago con Pago Móvil o tarjeta.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();

  const features = [
    { icon: QrIcon, title: t("f1"), body: t("f1d") },
    { icon: SplitSquareHorizontal, title: t("f2"), body: t("f2d") },
    { icon: Wallet, title: t("f3"), body: t("f3d") },
    { icon: Plug, title: t("f4"), body: t("f4d") },
  ];

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <span className="font-display text-2xl">{t("brand")}</span>
        <div className="flex items-center gap-3">
          <LangToggle />
          <Link
            to="/login"
            className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
          >
            {t("ctaLogin")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <section className="grid items-center gap-10 py-10 md:grid-cols-[1.1fr_0.9fr] md:py-16">
          <div>
            <h1 className="text-4xl leading-[1.05] md:text-6xl">{t("tagline")}</h1>
            <p className="mt-5 max-w-md text-base text-muted-foreground">{t("heroSub")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/t"
                search={{ demo: "1" }}

                className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("ctaDemo")}
              </Link>
              <Link
                to="/dashboard"
                className="rounded-full border border-border px-6 py-3 text-sm transition-colors hover:bg-secondary"
              >
                {t("ctaLogin")}
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("demoNote")}</p>
          </div>

          <div className="surface mx-auto flex w-full max-w-xs flex-col items-center gap-4 p-8 text-center shadow-[var(--shadow-glow)]">
            <QrCode value="mesa-15" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {restaurant.name}
              </p>
              <p className="font-display text-3xl">
                {t("table")} 15
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <article key={f.title} className="surface p-6">
              <f.icon className="mb-4 h-5 w-5 text-primary" />
              <h2 className="text-xl">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
