import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  QrCode,
  Receipt,
  Smartphone,
  Split,
  Timer,
  Utensils,
} from "lucide-react";

const TITLE = "TPV para hostelería: cobra por mesa sin fricción — Splite";
const DESC =
  "Splite complementa tu TPV de hostelería: un QR por mesa, cada comensal elige lo que consumió y paga su parte desde el móvil. Menos esperas, más rotación de mesas.";

export const Route = createFileRoute("/tpv-hosteleria")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://splite.lovable.app/tpv-hosteleria" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://splite.lovable.app/tpv-hosteleria" }],
  }),
  component: TpvHosteleria,
});

const BENEFITS = [
  {
    icon: QrCode,
    title: "Un QR permanente por mesa",
    text: "El comensal escanea el código de su mesa y ve su cuenta al instante, sin apps ni registros.",
  },
  {
    icon: Split,
    title: "División de cuenta automática",
    text: "Cada cliente selecciona lo que consumió o reparte a partes iguales. Tu equipo no hace cuentas.",
  },
  {
    icon: Smartphone,
    title: "Pago desde el móvil",
    text: "Pago Móvil, C2P y referencia en bolívares con tasa BCV del día. Sin datáfonos compartidos.",
  },
  {
    icon: Timer,
    title: "Más rotación de mesas",
    text: "El cobro deja de ser el cuello de botella del servicio: las mesas se liberan antes.",
  },
  {
    icon: Receipt,
    title: "IVA y servicio calculados",
    text: "La cuenta muestra subtotal, IVA y cargo por servicio desglosados según tu configuración fiscal.",
  },
  {
    icon: Utensils,
    title: "Compatible con tu operación",
    text: "Tu personal gestiona mesas, menú y pagos desde un panel web, junto a tu TPV actual.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Abre la mesa desde el panel",
    text: "El personal crea la cuenta de la mesa y añade los productos del menú, igual que en tu TPV de hostelería.",
  },
  {
    n: "2",
    title: "El comensal escanea el QR",
    text: "Ve la cuenta en vivo, elige qué pagar y puede dejar propina. Todo desde su navegador.",
  },
  {
    n: "3",
    title: "Paga y listo",
    text: "El pago queda registrado y tu equipo lo confirma en el panel. La mesa se cierra sin pasar por caja.",
  },
];

function TpvHosteleria() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-5 py-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link to="/" className="text-[17px] font-semibold tracking-[0.14em]">
            SPLITE
          </Link>
          <Link
            to="/registro"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Solicitar acceso
          </Link>
        </div>
      </header>

      <main>
        <section className="px-5 py-16 md:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              TPV hostelería
            </p>
            <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-6xl">
              Tu TPV de hostelería cobra. Splite hace que cada cliente pague lo suyo.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Dividir la cuenta a mano consume minutos de cada mesa y genera errores. Splite se suma
              a tu TPV para hostelería con un QR por mesa: los comensales dividen la cuenta y pagan
              desde su móvil, y tu equipo confirma el cobro en un panel.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/registro"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Quiero Splite en mi restaurante
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="/t?demo=1"
                className="inline-flex min-h-[48px] items-center rounded-full border border-border px-6 text-[15px] font-semibold transition-colors hover:bg-accent"
              >
                Ver demo de comensal
              </a>
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-16 md:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <h2 className="font-serif text-3xl md:text-4xl">
              Lo que un TPV tradicional no resuelve
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              El TPV registra la venta, pero el momento de cobrar sigue siendo manual: traer el
              datáfono, dividir entre seis personas, repetir el pago. Splite automatiza justo esa
              parte.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((b) => (
                <div key={b.title} className="rounded-2xl border border-border bg-card p-6">
                  <b.icon className="size-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{b.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-16 md:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <h2 className="font-serif text-3xl md:text-4xl">Cómo funciona en tu sala</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-2xl border border-border bg-card p-6">
                  <p className="font-serif text-4xl text-primary">{s.n}</p>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-16 md:py-24">
          <div className="mx-auto w-full max-w-6xl rounded-3xl border border-border bg-card p-8 text-center md:p-14">
            <h2 className="mx-auto max-w-2xl font-serif text-3xl md:text-4xl">
              Empieza a cobrar por mesa esta semana
            </h2>
            <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-muted-foreground">
              {[
                "Sin hardware nuevo: funciona con el móvil del comensal",
                "Configuración de IVA y servicio incluida",
                "Te acompañamos en el alta de tu restaurante",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              to="/registro"
              className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Solicitar registro
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8">
        <p className="mx-auto w-full max-w-6xl text-xs text-muted-foreground">
          © 2026 Splite ·{" "}
          <Link to="/" className="hover:text-foreground">
            Volver al inicio
          </Link>
        </p>
      </footer>
    </div>
  );
}
