import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Check,
  ClipboardList,
  HandCoins,
  KeyRound,
  Lock,
  QrCode as QrIcon,
  Receipt,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Utensils,
} from "lucide-react";
import { C2P_BANKS, money } from "@/components/marketing/format";
import {
  C2PMockup,
  CountUp,
  CurrencyToggle,
  DashboardMockup,
  LiveSplitMockup,
  QrCardMockup,
} from "@/components/marketing/Mockups";
import { TryDemo } from "@/components/marketing/TryDemo";

const TITLE = "Splite — Pay at table para restaurantes modernos";
const DESC =
  "Simplifica el cobro en tu restaurante con un QR por mesa. Los comensales dividen la cuenta y pagan desde el móvil mientras tu equipo se enfoca en la experiencia.";

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
        <HowItWorks />
        <ItemSplit />
        <GetPaid />
        <OrderFromTable />
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
          <a className="transition-colors hover:text-foreground" href="#cobro">
            Cómo cobras
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
  /*
   * La moneda de todos los ejemplos de arriba, en estado y no en CSS, porque la
   * comparte el mockup. Arranca en bolívares: es la moneda en la que se cobra
   * de verdad en el salón, y abrir en dólares era la razón por la que esta
   * página parecía de otro país.
   */
  const [currency, setCurrency] = useState<"USD" | "VES">("VES");

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
            Tus clientes piden desde el QR de la mesa, cada quien elige lo que consumió y paga su
            parte desde su banco. En bolívares o en dólares, a la tasa del día.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta to="/registro">Quiero Splite en mi restaurante</PrimaryCta>
            {/* La demo del comensal es el mejor activo que hay y estaba de
                enlace de pie de página. Funciona, tiene números reales y
                contesta en diez segundos lo que el texto tarda una pantalla. */}
            <GhostCta href="/t?demo=1">Ver la demo</GhostCta>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sin app para tus clientes. Escanean, piden y pagan.
          </p>
          <div className="mt-5">
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
        </div>

        <div className="rise flex items-end justify-center gap-4 lg:justify-end">
          <div className="hidden sm:block">
            <QrCardMockup />
          </div>
          <LiveSplitMockup currency={currency} />
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
              { n: "Hamburguesa", p: money(18, "VES"), who: "Carlos" },
              { n: "Pizza", p: money(22, "VES"), who: "Ana" },
              { n: "Cervezas", p: money(12, "VES"), who: "Carlos · Pedro" },
              { n: "Papas", p: money(8, "VES"), who: "Pedro" },
            ].map((r) => (
              <div
                key={r.n}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate">{r.n}</p>
                  <p className="truncate text-xs text-primary">{r.who}</p>
                </div>
                <span className="figure text-muted-foreground">{r.p}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-2xl font-semibold">
              <CountUp to={60 * 757.54} decimals={0} suffix=" Bs" />
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function HowItWorks() {
  /*
   * Una sola sección de «cómo funciona».
   *
   * Había dos, con los mismos tres pasos y casi las mismas palabras: ésta con
   * iconos y otra llamada «El producto» con 01/02/03. Novecientos píxeles de
   * scroll para leer lo mismo dos veces. Se queda una, con el mockup que de
   * verdad se puede tocar.
   */
  return (
    <Section id="como-funciona">
      <div className="max-w-2xl">
        <Eyebrow>Cómo funciona</Eyebrow>
        <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
          Piden, eligen y pagan. Tu equipo no hace cuentas.
        </h2>
        <p className="mt-4 text-[17px] text-muted-foreground">
          Pruébalo aquí mismo: es la pantalla que ve tu cliente.
        </p>
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        {/* Aquí había un mockup que imitaba el reparto con precios a mano.
            Ahora está la pantalla de verdad, en modo demo: si el producto
            cambia, esto cambia con él, que es lo que una copia nunca hace. */}
        <div className="flex min-w-0 justify-center">
          <TryDemo />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: QrIcon,
              t: "Escanean",
              d: "Un QR por mesa abre la carta y la cuenta en el navegador. Sin descargar nada.",
            },
            {
              icon: ClipboardList,
              t: "Piden y eligen",
              d: "Piden desde la carta y marcan lo que consumió cada quien, o dividen en partes iguales.",
            },
            {
              icon: Receipt,
              t: "Pagan",
              d: "Cada persona paga su parte desde su banco. Servicio e IVA se calculan sobre lo que le toca.",
            },
          ].map((s2, i) => (
            <article
              key={s2.t}
              style={{ "--i": i } as React.CSSProperties}
              className="reveal reveal-item rounded-2xl border border-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1"
            >
              <s2.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-xl">{s2.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s2.d}</p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

/**
 * Cómo entra el dinero. La sección que faltaba.
 *
 * La página anterior remataba el asunto con un chip que decía «Pagos
 * integrados próximamente» y una línea de «pasarela de pagos: próximamente».
 * Las dos eran falsas: C2P de Mercantil está en producción y cobra de la cuenta
 * del propio comensal, y los avisos de pago móvil se verifican desde el panel.
 *
 * Era el peor sitio posible para una promesa aplazada, porque «¿y cómo me
 * pagan?» es la primera pregunta de cualquiera que mire esto en Venezuela.
 */
function GetPaid() {
  return (
    <Section id="cobro" className="border-y border-border bg-secondary">
      <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div>
          <Eyebrow>Cómo cobras</Eyebrow>
          <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
            El cobro entra desde el banco del comensal.
          </h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
            Con Clave 2 Pagos, tu cliente elige su banco, pide su clave y paga sin levantarse. No
            hay que perseguir capturas de pantalla ni teclear referencias.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Banknote,
                t: `${C2P_BANKS} bancos`,
                d: "Clave 2 Pagos, con las instrucciones de cada banco dentro de la app.",
              },
              {
                icon: Smartphone,
                t: "Pago móvil",
                d: "El comensal avisa y tu equipo lo verifica desde el panel, mesa por mesa.",
              },
              {
                icon: HandCoins,
                t: "En caja",
                d: "Efectivo, tarjeta o transferencia quedan registrados en la misma cuenta.",
              },
            ].map((c, i) => (
              <article
                key={c.t}
                style={{ "--i": i } as React.CSSProperties}
                className="reveal reveal-item rounded-2xl border border-border bg-card p-5"
              >
                <c.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-lg">{c.t}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{c.d}</p>
              </article>
            ))}
          </div>

          <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-4 py-2 text-sm font-medium text-primary">
            <Check className="h-4 w-4" /> Las propinas se atribuyen al mesero de la mesa
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <C2PMockup />
        </div>
      </div>
    </Section>
  );
}

/**
 * Pedir desde la mesa, que cambia de categoría el producto.
 *
 * Desde que el comensal puede pedir desde el QR, esto dejó de ser «pay at
 * table» para ser «pide y paga». Es la diferencia entre una herramienta de
 * cobro y una de sala, y no aparecía en ningún sitio de la página.
 */
function OrderFromTable() {
  return (
    <Section id="pedidos">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Bandeja de pedidos
            </p>
            <ul className="mt-4 space-y-2">
              {[
                { m: "Mesa 4", l: "3 tequeños · 2 cachapas", t: "hace 1 min", n: true },
                { m: "Mesa 12", l: "1 pabellón · 2 cervezas", t: "hace 4 min", n: true },
                { m: "Mesa 9", l: "2 papelón con limón", t: "hace 12 min", n: false },
              ].map((o, i) => (
                <li
                  key={o.m}
                  style={{ "--i": i } as React.CSSProperties}
                  className="reveal reveal-item flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${o.n ? "bg-primary" : "bg-border"}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{o.m}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{o.l}</span>
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{o.t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <Eyebrow>Pedidos desde la mesa</Eyebrow>
          <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
            El QR ya no solo enseña la cuenta. También toma el pedido.
          </h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
            El comensal pide desde la carta con fotos y las líneas entran en la cuenta al instante.
            Tu equipo lo ve en una bandeja y da por visto lo que ya atendió.
          </p>
          <ul className="mt-6 grid gap-2 text-[15px]">
            {[
              "La carta se carga desde una foto o un PDF de la que ya tienes",
              "Una mesa sin cuenta abre la suya con el primer pedido",
              "Un mesero puede ponerse la mesa que no es de nadie",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2 text-muted-foreground">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Benefits() {
  /*
   * Cuatro frases, no cuatro tarjetas.
   *
   * Esto eran cuatro fichas grandes con titular y párrafo, y hoy las cuatro
   * dicen algo que la página ya ha *enseñado* más arriba: el reparto se ve
   * funcionando en el hero, el cobro tiene su propia sección y la bandeja de
   * pedidos está dibujada. Un beneficio escrito después de la demostración es
   * un pie de foto, y un pie de foto no necesita una tarjeta.
   */
  return (
    <Section className="border-y border-border bg-secondary">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="reveal">
          <Eyebrow>Beneficios</Eyebrow>
          <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
            Más rápido para tu equipo. Más fácil para tus clientes.
          </h2>
        </div>
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {[
            ["Menos tiempo cobrando", "La división la hace el cliente."],
            ["Menos errores", "Los importes se calculan en el servidor."],
            ["Mesas que rotan antes", "Nadie espera a que el mesero divida."],
            ["Sin instalar nada", "El cliente usa su propio teléfono."],
          ].map(([t, d], i) => (
            <li
              key={t}
              style={{ "--i": i % 2 } as React.CSSProperties}
              className="reveal reveal-item border-l-2 border-primary/30 pl-4"
            >
              <p className="text-[16px] font-medium">{t}</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-muted-foreground">{d}</p>
            </li>
          ))}
        </ul>
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
          {/* Capacidades, no nombres de tabla. La lista anterior («Mesas»,
              «Cuentas abiertas», «Ítems de la cuenta») era el esquema de la
              base de datos puesto en una columna, y dejaba fuera todo lo que
              se ha construido desde entonces: propinas, tasa, carta por foto,
              informe de cierre, segundo factor. */}
          <ul className="mt-6 grid gap-2 text-[15px] sm:grid-cols-2">
            {[
              "Plano de sala con lo que debe cada mesa",
              "Propinas repartidas por mesero",
              "Tasa del día aplicada a toda la carta",
              "Carta cargada desde una foto o un PDF",
              "Avisos de pago verificados en el panel",
              "Cierre de turno con lo cobrado y lo perdonado",
              "Roles para dueño, encargado, caja y sala",
              "Segundo factor para entrar al panel",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2 text-muted-foreground">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> {x}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <PrimaryCta to="/registro">Hablar con Splite</PrimaryCta>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Integraciones con POS: próximamente.</p>
        </div>
        <DashboardMockup />
      </div>
    </Section>
  );
}

function Onboarding() {
  return (
    <Section className="border-y border-border bg-secondary">
      <div className="reveal max-w-2xl">
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
            d: "Tus clientes piden, dividen la cuenta y pagan desde su teléfono.",
          },
        ].map((s, i) => (
          <li
            key={s.n}
            style={{ "--i": i } as React.CSSProperties}
            className="reveal reveal-item rounded-2xl border border-border bg-card p-6"
          >
            <span className="text-[13px] font-semibold figure text-primary">{s.n}</span>
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
    {
      icon: ShieldCheck,
      t: "Importes calculados en el backend",
      d: "Nada depende del teléfono del cliente.",
    },
    {
      icon: KeyRound,
      t: "Control de acceso por roles",
      d: "Cada miembro del equipo ve solo lo suyo.",
    },
    { icon: Lock, t: "Sesiones seguras", d: "Sesiones de invitado limitadas a su mesa." },
    {
      icon: KeyRound,
      t: "Segundo factor",
      d: "El panel admite 2FA con la app de autenticación que ya usas.",
    },
    {
      icon: Banknote,
      t: "La clave nunca se guarda",
      d: "La clave C2P se usa una vez y no tiene columna en la base de datos.",
    },
    { icon: RefreshCcw, t: "QR revocables", d: "Puedes rotar el QR de una mesa cuando quieras." },
    { icon: ClipboardList, t: "Registro de actividad", d: "Cada cuenta y pago queda registrado." },
    {
      icon: Check,
      t: "Protección contra pagos duplicados",
      d: "Claves de idempotencia en cada cobro.",
    },
  ];
  return (
    <Section id="seguridad" className="border-y border-border bg-secondary">
      <div className="reveal max-w-2xl">
        <Eyebrow>Confianza</Eyebrow>
        <h2 className="mt-4 text-[30px] leading-tight md:text-[44px]">
          Construido para manejar cuentas y pagos con precisión.
        </h2>
        <p className="mt-4 text-[17px] text-muted-foreground">
          Aislamiento total entre restaurantes: los datos de tu negocio son solo tuyos.
        </p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i, idx) => (
          <article
            key={i.t}
            style={{ "--i": idx % 3 } as React.CSSProperties}
            className="reveal reveal-item rounded-2xl border border-border bg-card p-6"
          >
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
          {/* Antes este botón también iba a /registro: dos llamadas idénticas
              con dos textos distintos. El que no pide datos lleva a la demo. */}
          <a
            href="/t?demo=1"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-border px-7 text-[15px] font-medium transition-colors hover:bg-secondary sm:w-auto"
          >
            Antes, ver la demo
          </a>
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
              <a className="hover:text-foreground" href="#cobro">
                Cómo cobras
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
            <li>
              <Link className="hover:text-foreground" to="/tpv-hosteleria">
                TPV para hostelería
              </Link>
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
