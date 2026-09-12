import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Check,
  ClipboardList,
  HandCoins,
  KeyRound,
  Menu,
  QrCode as QrIcon,
  Receipt,
  ScanLine,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { C2P_BANKS } from "@/components/marketing/format";
import {
  C2PMockup,
  CurrencyToggle,
  DashboardMockup,
  LiveSplitMockup,
  QrCardMockup,
  QrTableStrip,
} from "@/components/marketing/Mockups";
import { TryDemo } from "@/components/marketing/TryDemo";

/*
 * El orden de estas dos frases es la posición del producto.
 *
 * Primero el reparto, que es lo que se vende; el pedido va detrás, como lo que
 * suma. «Pay at table» se va: es jerga en inglés en una página que se lee en
 * Caracas, y además describe sólo la mitad de lo que hace esto.
 */
const TITLE = "Splite — El QR que divide la cuenta y cobra por mesa";
const DESC =
  "Con un QR por mesa, cada comensal ve la cuenta, elige lo que consumió y paga su parte desde su banco. Tu equipo deja de dividir cuentas.";

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
    <section id={id} className={`scroll-mt-20 px-5 py-20 md:py-32 ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

/*
 * Tres tamaños de titular, no uno.
 *
 * Nueve de los once encabezados de sección medían exactamente lo mismo
 * (`md:text-[44px]`), así que la página era once bloques del mismo peso y no
 * había forma de saber cuál importaba. La jerarquía la hace la tipografía; si
 * todo grita, no se oye nada.
 *
 *   lg  los tres momentos que sostienen el argumento -- por qué lo necesitas,
 *       cómo entra el dinero, qué recibe tu restaurante
 *   md  los que explican
 *   sm  los de apoyo, que acompañan y no compiten
 */
const H2 = {
  lg: "mt-4 text-[32px] leading-[1.08] md:text-[52px]",
  md: "mt-4 text-[28px] leading-tight md:text-[40px]",
  sm: "mt-4 text-[24px] leading-tight md:text-[32px]",
} as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{children}</p>
  );
}

/*
 * Una sola promesa, escrita una sola vez.
 *
 * Había **siete** textos distintos apuntando a `/registro` -- «Quiero Splite»,
 * «Quiero Splite en mi restaurante», «Hablar con Splite», «Para mi
 * restaurante», «Quiero probar Splite en mi restaurante», «Contacto» y
 * «Solicitar acceso» -- y **cuatro** apuntando a la demo. Once etiquetas para
 * dos destinos. Quien recorre la página no lee siete ofertas: lee que no
 * terminamos de decidir qué le estamos pidiendo, y cada variante le obliga a
 * comprobar si va al mismo sitio que la anterior.
 */
const CTA_PRIMARY = "Quiero Splite en mi restaurante";
/** Baja a la demo que se puede tocar, sin sacar a nadie de la página. */
const CTA_SECONDARY = "Ver cómo funciona";
const DEMO_ANCHOR = "#como-funciona";

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
        {/* Aquí vivía «Cada persona paga lo que realmente consumió», cuyo
            titular era un calco del H1 y cuyo contenido era una lista estática
            de nombres. La página ya enseña el reparto dos veces y funcionando:
            el hero se reparte solo y esta misma sección lleva la pantalla real
            del comensal. Una tercera explicación del mismo concepto no añade
            nada; quita aire.

            Y con ella «Para restaurantes / Para comensales», dos tarjetas que
            sólo repetían llamadas que ya están en el hero y en el cierre. */}
        <GetPaid />
        {/* El panel, antes de los beneficios y no en octavo lugar. Quien firma
            esto no es el comensal sino quien cuadra la caja al cerrar, y
            enseñarle lo que recibe *él* después de cuatro secciones sobre lo
            que recibe su cliente es dejarlo para cuando ya se ha ido. */}
        <ForOwners />
        <OrderFromTable />
        <Benefits />
        <Onboarding />
        <Trust />
        <FinalCta />
      </main>
      <Footer />
      <MobileStickyCta />
    </div>
  );
}

/** Los cuatro destinos de la página, en un sitio y no en dos. */
const NAV = [
  ["#como-funciona", "Cómo funciona"],
  ["#cobro", "Cómo cobras"],
  ["#restaurantes", "Para restaurantes"],
  ["#seguridad", "Seguridad"],
] as const;

function Nav() {
  /*
   * En el teléfono no había navegación. Ninguna.
   *
   * Los enlaces vivían en un `hidden md:flex` y no existía nada que los
   * sustituyera por debajo de esa anchura, así que quien llega desde un
   * teléfono -- que es casi todo el mundo -- sólo podía recorrer la página
   * hacia abajo. Las secciones de cobro y de seguridad, que son las que
   * contestan las dos preguntas que traen a un dueño hasta aquí, eran
   * inalcanzables salvo deslizando ocho mil píxeles.
   */
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link to="/" className="text-[17px] font-semibold tracking-[0.14em]">
          SPLITE
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV.map(([href, label]) => (
            <a key={href} className="transition-colors hover:text-foreground" href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden min-h-[40px] items-center rounded-full px-4 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Entrar
          </Link>
          {/* La llamada principal se queda visible también con el menú
              desplegado: es lo que ha venido a hacer quien pulsa. */}
          <Link
            to="/registro"
            className="inline-flex min-h-[40px] items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Quiero Splite
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="nav-movil"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Se cierra al elegir: si no, el destino queda tapado por el propio menú. */}
      {open && (
        <nav id="nav-movil" className="border-t border-border bg-background md:hidden">
          <ul className="mx-auto w-full max-w-6xl px-5 py-2">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <a
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center text-[15px] transition-colors hover:text-primary"
                >
                  {label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/login"
                className="flex min-h-12 items-center text-[15px] text-muted-foreground sm:hidden"
              >
                Entrar
              </Link>
            </li>
          </ul>
        </nav>
      )}
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
    <Section id="hero" className="pt-12 md:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rise">
          <Eyebrow>Para restaurantes</Eyebrow>
          <h1 className="mt-4 text-[40px] leading-[1.03] md:text-[64px]">
            Cada cliente paga lo suyo.
            <br />
            <span className="text-primary">Tu equipo no divide la cuenta.</span>
          </h1>
          {/* El reparto primero. Esta frase abría por el pedido -- «tus
              clientes piden desde el QR» --, que es lo que suma, no lo que se
              vende. Quien llega buscando dejar de dividir cuentas tenía que
              leer hasta la segunda línea para saber que había llegado. */}
          {/* Aquí decía «en bolívares o en dólares, a la tasa del día», y eso
              era falso: lo que puede estar en dólares es el precio de la
              carta, nunca el cobro. Splite liquida siempre en bolívares
              -- `003_ves_settlement.sql` lo impone en la base de datos --, así
              que la frase prometía una forma de cobro que no existe. La regla,
              dicha entera, vive ahora en la sección de cobro; el hero no es
              sitio para hablar de monedas. */}
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground md:text-[19px]">
            Cada comensal ve la cuenta desde el QR de la mesa, elige lo que consumió y paga su parte
            desde su banco.{" "}
            <span className="text-foreground">Y desde ahí mismo, también pide.</span>
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta to="/registro">{CTA_PRIMARY}</PrimaryCta>
            {/* Baja a la demo empotrada en vez de sacar a nadie a otra ruta:
                el mejor activo de la página está dentro de la página. */}
            <GhostCta href={DEMO_ANCHOR}>{CTA_SECONDARY} →</GhostCta>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sin app para tus clientes. Escanean, dividen y pagan.
          </p>
          <div className="mt-5">
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
        </div>

        {/* En el teléfono no había QR. `QrCardMockup` mide 220px y vivía en un
            `hidden sm:block`, así que por debajo de 640px la página contaba una
            historia que empieza escaneando y no enseñaba el escaneo -- en el
            único aparato donde esa historia ocurre de verdad. Debajo de ese
            ancho entra la versión estrecha, apilada sobre el teléfono. */}
        <div className="rise flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-center lg:justify-end">
          <QrTableStrip className="sm:hidden" />
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
  /*
   * El antes tenía voz y el después no tenía nada.
   *
   * Esta sección enseñaba las cinco frases que se oyen en una mesa de seis y
   * paraba ahí, con una línea de texto diciendo que Splite lo arregla. Es medio
   * argumento: el problema se veía y la solución había que imaginársela. Al
   * ponerlos uno al lado del otro, la comparación la hace el ojo y no el
   * párrafo -- que es justo lo que se le pide a una página que se lee de pie.
   */
  const antes = [
    "¿Cuánto me toca?",
    "Yo pagué las cervezas.",
    "¿Quién pagó el postre?",
    "¿Puedes dividir la cuenta otra vez?",
  ];
  const despues = ["Escanea el QR", "Elige lo que consumiste", "Paga tu parte", "Mesa cerrada"];

  return (
    <Section className="border-y border-border bg-secondary">
      <div className="reveal max-w-2xl">
        <Eyebrow>El problema</Eyebrow>
        <h2 className={H2.lg}>Dividir una cuenta no debería tomar más tiempo que comer.</h2>
        <p className="mt-5 text-[17px] text-muted-foreground">
          Con varios comensales en una mesa, dividir, calcular y cobrar se convierte en trabajo
          extra para tu equipo. Splite lo mueve al teléfono del cliente.
        </p>
      </div>

      {/* Dos columnas de igual peso: la comparación pierde la gracia si una de
          las dos parece la nota al pie de la otra. En el teléfono se apilan,
          y por eso el orden importa -- primero el ruido, después la salida. */}
      <div className="mt-10 grid items-start gap-5 md:grid-cols-2">
        <article className="reveal rounded-2xl border border-border bg-card p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Antes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mesa de seis, y todo acaba en el mesero.
          </p>
          <ul className="mt-5 space-y-3">
            {antes.map((l, i) => (
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
        </article>

        <article
          style={{ "--i": 1 } as React.CSSProperties}
          className="reveal reveal-item rounded-2xl border border-primary/30 bg-card p-6"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary">Con Splite</p>
          <p className="mt-1 text-sm text-muted-foreground">
            La misma mesa, sin que nadie eche cuentas.
          </p>
          <ol className="mt-5">
            {despues.map((l, i) => (
              <li key={l} className="flex items-start gap-3">
                {/* La línea que une los pasos se dibuja aquí y no con un icono
                    por fila: cuatro flechas sueltas son cuatro cosas que mirar,
                    y lo que hay que leer son las cuatro palabras. */}
                <span className="flex flex-col items-center self-stretch">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  {i < despues.length - 1 && <span className="w-px flex-1 bg-primary/25" />}
                </span>
                <span
                  className={`text-[15px] ${i === despues.length - 1 ? "font-medium" : ""} pb-5`}
                >
                  {l}
                </span>
              </li>
            ))}
          </ol>
        </article>
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
        <h2 className={H2.md}>Piden, eligen y pagan. Tu equipo no hace cuentas.</h2>
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
              d: "Un QR por mesa abre la cuenta —y la carta— en el navegador. Sin descargar nada.",
            },
            {
              icon: ClipboardList,
              t: "Eligen lo suyo",
              d: "Cada quien marca lo que consumió, o dividen la cuenta en partes iguales.",
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
          <h2 className={H2.lg}>El cobro entra desde el banco del comensal.</h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
            Con Clave 2 Pagos, tu cliente elige su banco, pide su clave y paga sin levantarse. No
            hay que perseguir capturas de pantalla ni teclear referencias.
          </p>
          {/* La moneda, dicha donde toca y sin ambigüedad. */}
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Pon los precios en bolívares o en dólares, como los tengas en la carta.{" "}
            <span className="text-foreground">El cobro es siempre en bolívares</span>, a la tasa del
            día.
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
          {/* «Y además» no es un adorno: es la posición. El reparto es lo que
              se vende y esto es lo que viene encima, y decirlo así evita que
              dos promesas grandes compitan por el mismo sitio. */}
          <Eyebrow>Y además</Eyebrow>
          <h2 className={H2.md}>El mismo QR también toma el pedido.</h2>
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
          <h2 className={H2.md}>Más rápido para tu equipo. Más fácil para tus clientes.</h2>
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
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <Eyebrow>Para el restaurante</Eyebrow>
          <h2 className={H2.lg}>Pensado para el restaurante, no solo para el cliente.</h2>
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
            <PrimaryCta to="/registro">{CTA_PRIMARY}</PrimaryCta>
          </div>
          {/* «Integraciones con POS: próximamente», solo, se lee como un hueco.
              Lo que de verdad importa a quien ya tiene caja montada es que no
              hay que tocarla, y eso es cierto justamente porque no hay
              integración: Splite no habla con ningún TPV. */}
          <p className="mt-4 text-sm text-muted-foreground">
            Funciona al margen del TPV que ya tienes. Integraciones con POS: próximamente.
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
      <div className="reveal max-w-2xl">
        <Eyebrow>Puesta en marcha</Eyebrow>
        <h2 className={H2.sm}>Así funciona tu restaurante con Splite.</h2>
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

function Trust() {
  /*
   * Cuatro, no ocho.
   *
   * La lista había crecido hasta ocho tarjetas y una rejilla de ocho promesas
   * de seguridad no se lee: se hojea, y entonces no vale ninguna. Se quedan las
   * cuatro que contestan preguntas distintas -- dónde se calcula el dinero,
   * quién puede ver qué, qué pasa con la clave del banco y qué impide cobrar
   * dos veces -- y las dos que más pesan para quien te va a meter su flujo de
   * caja: el segundo factor y que la clave no se guarda en ningún sitio.
   *
   * Las que salen no desaparecen del producto -- los QR se siguen pudiendo
   * rotar y todo sigue quedando registrado --; salen de *esta* rejilla, que es
   * un argumento de venta y no un inventario.
   */
  const items = [
    {
      icon: ShieldCheck,
      t: "Los importes se calculan en el servidor",
      d: "Nada depende del teléfono del cliente.",
    },
    {
      icon: KeyRound,
      t: "Roles y segundo factor",
      d: "Cada quien ve lo suyo, y el panel admite 2FA.",
    },
    {
      icon: Banknote,
      t: "La clave del banco nunca se guarda",
      d: "La clave C2P se usa una vez y no tiene columna en la base de datos.",
    },
    {
      icon: Check,
      t: "Sin cobros duplicados",
      d: "Cada cobro lleva su clave de idempotencia.",
    },
  ];
  return (
    <Section id="seguridad" className="border-y border-border bg-secondary">
      <div className="reveal max-w-2xl">
        <Eyebrow>Confianza</Eyebrow>
        <h2 className={H2.sm}>Construido para manejar cuentas y pagos con precisión.</h2>
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
        <h2 className={`${H2.lg} mx-auto max-w-3xl`}>
          ¿Cuántas veces al día tu equipo tiene que dividir una cuenta?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] text-muted-foreground md:text-[19px]">
          Deja que tus clientes hagan esa parte.
        </p>
        <div className="mx-auto mt-8 flex max-w-lg flex-col justify-center gap-3 sm:flex-row">
          <PrimaryCta to="/registro">{CTA_PRIMARY}</PrimaryCta>
          <a
            href={DEMO_ANCHOR}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-border px-7 text-[15px] font-medium transition-colors hover:bg-secondary sm:w-auto"
          >
            {CTA_SECONDARY} →
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
          {/* Repetía el H1 palabra por palabra, que es la quinta vez que esa
              frase aparecía en la página. Aquí lo útil es decir qué es esto. */}
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Cobro y pedidos por QR para restaurantes.
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
            {/* Eran dos entradas con dos nombres y el mismo destino. */}
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
  /*
   * No mientras la llamada del hero siga en pantalla.
   *
   * Las dos son el mismo botón con el mismo texto y el mismo destino, y en un
   * teléfono aparecían pegadas: dos píldoras verdes idénticas, una encima de
   * otra, nada más abrir la página. Una barra fija existe para traer de vuelta
   * lo que ya no se ve; mientras se ve, sólo tapa medio palmo de pantalla.
   *
   * Arranca oculta y la descubre el propio hero al salir. Si el script no
   * llega, no aparece nunca -- y no se pierde nada, porque el «Quiero Splite»
   * de la barra de arriba está fijo y siempre visible.
   */
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.querySelector("#hero");
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setShow(!e?.isIntersecting), {
      // Un pelo de margen: que reaparezca justo al perderse de vista, y no
      // cuando ya se ha ido media pantalla.
      rootMargin: "-72px 0px 0px 0px",
    });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <div
      hidden={!show}
      className="sticky bottom-0 z-40 border-t border-border bg-background/95 px-5 py-3 backdrop-blur md:hidden"
    >
      <Link
        to="/registro"
        className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
      >
        {CTA_PRIMARY}
      </Link>
    </div>
  );
}
