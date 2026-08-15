import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Clock,
  KeyRound,
  Lock,
  QrCode as QrIcon,
  Receipt,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Utensils,
} from "lucide-react";
import {
  BillMockup,
  CountUp,
  DashboardMockup,
  QrCardMockup,
  SplitMockup,
} from "@/components/marketing/Mockups";

const TITLE = "Splite — Cada cliente paga lo suyo, tu equipo no divide la cuenta";
const DESC =
  "Splite es la herramienta para restaurantes que elimina el trabajo de dividir y cobrar cuentas: un QR por mesa, cada comensal elige lo que consumió y paga su parte.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 px-5 py-16 md:py-24 ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{children}</p>
  );
}

function PrimaryCta({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-[15px] font-semibold text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function GhostCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-border bg-card px-7 text-[15px] font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
    >
      {children}
    </a>
  );
}

function Landing() {
  return (
    <div className="marketing min-h-screen">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Demo />
        <ItemSplit />
        <HowItWorks />
        <Benefits />
        <ForOwners />
        <Onboarding />
        <Audiences />
        <Trust />
        <FinalCta />
      </main>
      <Footer />
      <MobileStickyCta />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link to="/" className="text-[17px] font-semibold tracking-[0.14em]">
          SPLITE
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a className="transition-colors hover:text-foreground" href="#como-funciona">
            Cómo funciona
          </a>
          <a className="transition-colors hover:text-foreground" href="#restaurantes">
            Para restaurantes
          </a>
          <a className="transition-colors hover:text-foreground" href="#seguridad">
            Seguridad
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden min-h-[40px] items-center rounded-full px-4 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Entrar
          </Link>
          <Link
            to="/registro"
            className="inline-flex min-h-[40px] items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Quiero Splite
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <Section className="pt-12 md:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rise">
          <Eyebrow>Para restaurantes</Eyebrow>
          <h1 className="mt-4 text-[36px] leading-[1.05] md:text-[58px]">
            Cada cliente paga lo suyo.
            <br />
            <span className="text-primary">Tu equipo no divide la cuenta.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground md:text-[19px]">
            Splite permite que cada comensal vea la cuenta, elija lo que consumió y pague su parte
            desde su teléfono.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta to="/registro">Quiero Splite en mi restaurante</PrimaryCta>
            <GhostCta href="#como-funciona">Ver cómo funciona</GhostCta>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sin app para tus clientes. Escanean, revisan y pagan.
          </p>
          <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Pagos integrados próximamente
          </p>
        </div>

        <div className="rise flex items-end justify-center gap-4 lg:justify-end">
          <div className="hidden sm:block">
            <QrCardMockup />
          </div>
          <BillMockup />
        </div>
      </div>
    </Section>
  );
}

function Problem() {
  const lines = [
    "¿Cuánto me toca?",
    "Yo pagué las cervezas.",
    "¿Quién pagó el postre?",
    "Falta cobrar $18.",
    "¿Puedes dividir la cuenta otra vez?",
  ];
  return (
    <Section className="border-y border-border bg-secondary">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <Eyebrow>El problema</Eyebrow>
          <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
            Dividir una cuenta no debería tomar más tiempo que comer.
          </h2>
          <p className="mt-5 max-w-md text-[17px] text-muted-foreground">
            Todo esto termina en el mesero. Splite mueve esa parte del trabajo al teléfono del
            cliente.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Mesa de 6 personas
          </p>
          <ul className="mt-4 space-y-3">
            {lines.map((l, i) => (
              <li
                key={l}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] ${
                  i % 2 === 0
                    ? "bg-secondary text-foreground"
                    : "ml-auto bg-foreground/90 text-background"
                }`}
              >
                {l}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Demo() {
  return (
    <Section id="producto">
      <div className="max-w-2xl">
        <Eyebrow>El producto</Eyebrow>
        <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
          Splite hace que cobrar una mesa sea más sencillo.
        </h2>
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="flex justify-center">
          <SplitMockup />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "01",
              t: "Escanean",
              d: "Un QR por mesa abre la cuenta directamente en el teléfono.",
            },
            {
              n: "02",
              t: "Eligen",
              d: "Cada comensal selecciona lo que consumió o divide la cuenta como prefiera.",
            },
            {
              n: "03",
              t: "Liquidan",
              d: "Cada persona cubre su parte y la mesa cierra sin que el equipo haga cuentas.",
            },
          ].map((s) => (
            <article
              key={s.n}
              className="rounded-2xl border border-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1"
            >
              <span className="text-[13px] font-semibold tabular-nums text-primary">{s.n}</span>
              <h3 className="mt-3 text-xl">{s.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

function ItemSplit() {
  return (
    <Section className="border-y border-border bg-secondary">
      <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
        <div>
          <Eyebrow>Reparto por producto</Eyebrow>
          <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
            Cada persona paga lo que realmente consumió.
          </h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
            ¿Uno pidió la pizza y otro tomó dos cervezas? Cada persona selecciona sus productos.
            Splite calcula automáticamente cuánto corresponde a cada uno.
          </p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-4 py-2 text-sm font-medium text-primary">
            <Check className="h-4 w-4" /> Sin dividir todo en partes iguales
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Mesa 12</p>
            <span className="text-[11px] text-muted-foreground">Casa 72</span>
          </div>
          <div className="mt-4 space-y-2 text-[15px]">
            {[
              { n: "Hamburguesa", p: "$18,00", who: "Carlos" },
              { n: "Pizza", p: "$22,00", who: "Ana" },
              { n: "Cervezas", p: "$12,00", who: "Carlos · Pedro" },
              { n: "Papas", p: "$8,00", who: "Pedro" },
            ].map((r) => (
              <div
                key={r.n}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate">{r.n}</p>
                  <p className="truncate text-xs text-primary">{r.who}</p>
                </div>
                <span className="tabular-nums text-muted-foreground">{r.p}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-2xl font-semibold">
              <CountUp to={60} prefix="$" />
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function HowItWorks() {
  return (
    <Section id="como-funciona">
      <div className="max-w-2xl">
        <Eyebrow>Cómo funciona</Eyebrow>
        <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
          Escanear, elegir y liquidar. Nada más.
        </h2>
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {[
          {
            icon: QrIcon,
            t: "Escanean",
            d: "El comensal apunta la cámara al QR de la mesa y la cuenta abre en su navegador.",
          },
          {
            icon: ClipboardList,
            t: "Eligen",
            d: "Marca los productos que consumió, divide en partes iguales o escribe un monto.",
          },
          {
            icon: Receipt,
            t: "Liquidan",
            d: "Splite calcula servicio e IVA sobre lo que le toca a cada quien y registra su parte.",
          },
        ].map((s) => (
          <article
            key={s.t}
            className="rounded-2xl border border-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1"
          >
            <s.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-4 text-xl">{s.t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
          </article>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <GhostCta href="/t?demo=1">Probar la vista del comensal</GhostCta>
      </div>
    </Section>
  );
}

function Benefits() {
  return (
    <Section className="border-y border-border bg-secondary">
      <div className="max-w-2xl">
        <Eyebrow>Beneficios</Eyebrow>
        <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
          Más rápido para tu equipo. Más fácil para tus clientes.
        </h2>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {[
          {
            t: "Menos tiempo cobrando",
            d: "El cliente hace la división y reduce el trabajo manual del equipo.",
          },
          {
            t: "Menos errores",
            d: "Los importes se calculan automáticamente y cada pago queda registrado.",
          },
          {
            t: "Mesas que cierran más fácil",
            d: "Todos pueden pagar su parte sin esperar a que el mesero divida la cuenta.",
          },
          {
            t: "Una experiencia moderna",
            d: "El cliente usa su propio teléfono. No necesita descargar una aplicación.",
          },
        ].map((b) => (
          <article key={b.t} className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-xl">{b.t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{b.d}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function ForOwners() {
  return (
    <Section id="restaurantes">
      <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <Eyebrow>Para el restaurante</Eyebrow>
          <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
            Pensado para el restaurante, no solo para el cliente.
          </h2>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted-foreground">
            Splite conecta la experiencia del comensal con la operación del restaurante.
          </p>
          <ul className="mt-6 grid gap-2 text-[15px] sm:grid-cols-2">
            {[
              "Mesas",
              "Cuentas abiertas",
              "Menú y productos",
              "Ítems de la cuenta",
              "Roles del personal",
              "Códigos QR por mesa",
              "Estado de los pagos",
              "Cierre de la cuenta",
            ].map((x) => (
              <li key={x} className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-primary" /> {x}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <PrimaryCta to="/registro">Hablar con Splite</PrimaryCta>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Integraciones POS y pasarela de pagos: próximamente.
          </p>
        </div>
        <DashboardMockup />
      </div>
    </Section>
  );
}

function Onboarding() {
  return (
    <Section className="border-y border-border bg-secondary">
      <div className="max-w-2xl">
        <Eyebrow>Puesta en marcha</Eyebrow>
        <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
          Así funcionará tu restaurante con Splite.
        </h2>
        <p className="mt-4 text-[17px] text-muted-foreground">
          Acompañamos la configuración inicial con tu equipo.
        </p>
      </div>
      <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { n: "01", t: "Configura tu restaurante", d: "Agrega tu menú, mesas y equipo." },
          { n: "02", t: "Genera tus QR", d: "Cada mesa tiene su propio QR, listo para imprimir." },
          { n: "03", t: "Colócalos en las mesas", d: "El cliente escanea desde su teléfono." },
          {
            n: "04",
            t: "Deja que Splite haga el trabajo",
            d: "Los clientes consultan y dividen la cuenta.",
          },
        ].map((s) => (
          <li key={s.n} className="rounded-2xl border border-border bg-card p-6">
            <span className="text-[13px] font-semibold tabular-nums text-primary">{s.n}</span>
            <h3 className="mt-3 text-lg">{s.t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Audiences() {
  return (
    <Section>
      <div className="grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-border bg-foreground p-8 text-background">
          <Utensils className="h-5 w-5 opacity-80" />
          <h2 className="mt-4 text-[26px] md:text-[32px]">Para restaurantes</h2>
          <p className="mt-3 max-w-sm text-[16px] leading-relaxed opacity-80">
            Una herramienta para simplificar el cobro y reducir trabajo operativo.
          </p>
          <Link
            to="/registro"
            className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-background px-6 text-[15px] font-semibold text-foreground"
          >
            Para mi restaurante
          </Link>
        </article>
        <article className="rounded-2xl border border-border bg-card p-8">
          <Smartphone className="h-5 w-5 text-primary" />
          <h2 className="mt-4 text-[26px] md:text-[32px]">Para comensales</h2>
          <p className="mt-3 max-w-sm text-[16px] leading-relaxed text-muted-foreground">
            Escanea. Mira tu cuenta. Elige lo que pagas. Sin descargar ninguna app.
          </p>
          <a
            href="/t?demo=1"
            className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full border border-border px-6 text-[15px] font-medium transition-colors hover:bg-secondary"
          >
            Ver cómo funciona
          </a>
        </article>
      </div>
    </Section>
  );
}

function Trust() {
  const items = [
    { icon: ShieldCheck, t: "Importes calculados en el backend", d: "Nada depende del teléfono del cliente." },
    { icon: KeyRound, t: "Control de acceso por roles", d: "Cada miembro del equipo ve solo lo suyo." },
    { icon: Lock, t: "Sesiones seguras", d: "Sesiones de invitado limitadas a su mesa." },
    { icon: RefreshCcw, t: "QR revocables", d: "Puedes rotar el QR de una mesa cuando quieras." },
    { icon: ClipboardList, t: "Registro de actividad", d: "Cada cuenta y pago queda registrado." },
    { icon: Check, t: "Protección contra pagos duplicados", d: "Claves de idempotencia en cada cobro." },
  ];
  return (
    <Section id="seguridad" className="border-y border-border bg-secondary">
      <div className="max-w-2xl">
        <Eyebrow>Confianza</Eyebrow>
        <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
          Construido para manejar cuentas y pagos con precisión.
        </h2>
        <p className="mt-4 text-[17px] text-muted-foreground">
          Aislamiento total entre restaurantes: los datos de tu negocio son solo tuyos.
        </p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <article key={i.t} className="rounded-2xl border border-border bg-card p-6">
            <i.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-4 text-lg">{i.t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{i.d}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <Section>
      <div className="rounded-3xl border border-border bg-card px-6 py-14 text-center md:px-16">
        <h2 className="mx-auto max-w-3xl text-[30px] leading-tight md:text-[46px]">
          ¿Cuántas veces al día tu equipo tiene que dividir una cuenta?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] text-muted-foreground md:text-[19px]">
          Deja que tus clientes hagan esa parte.
        </p>
        <div className="mx-auto mt-8 flex max-w-lg flex-col justify-center gap-3 sm:flex-row">
          <PrimaryCta to="/registro">Quiero probar Splite en mi restaurante</PrimaryCta>
          <Link
            to="/registro"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-border px-7 text-[15px] font-medium transition-colors hover:bg-secondary sm:w-auto"
          >
            Hablar con el equipo
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Te pedimos solo lo necesario: nombre, restaurante, contacto y tamaño del salón.
        </p>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background px-5 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-10 md:grid-cols-[1.2fr_repeat(3,0.6fr)]">
        <div>
          <p className="text-[17px] font-semibold tracking-[0.14em]">SPLITE</p>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Cada cliente paga lo suyo. Tu equipo no divide la cuenta.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Producto</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a className="hover:text-foreground" href="#como-funciona">
                Cómo funciona
              </a>
            </li>
            <li>
              <a className="hover:text-foreground" href="#restaurantes">
                Para restaurantes
              </a>
            </li>
            <li>
              <a className="hover:text-foreground" href="#seguridad">
                Seguridad
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Empresa</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link className="hover:text-foreground" to="/registro">
                Contacto
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" to="/registro">
                Solicitar acceso
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Acceso</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link className="hover:text-foreground" to="/login">
                Entrar al panel
              </Link>
            </li>
            <li>
              <a className="hover:text-foreground" href="/t?demo=1">
                Demo de comensal
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="mx-auto mt-10 w-full max-w-6xl text-xs text-muted-foreground">© 2026 Splite</p>
    </footer>
  );
}

function MobileStickyCta() {
  return (
    <div className="sticky bottom-0 z-40 border-t border-border bg-background/95 px-5 py-3 backdrop-blur md:hidden">
      <Link
        to="/registro"
        className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
      >
        Quiero Splite en mi restaurante
      </Link>
    </div>
  );
}
