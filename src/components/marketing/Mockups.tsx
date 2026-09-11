import { useEffect, useRef, useState } from "react";
import { Check, QrCode as QrIcon, Users, Wifi } from "lucide-react";

import { DEMO_RATE, money, useReducedMotion } from "./format";

/** Marco de teléfono realista para los mockups de producto. */
export function Phone({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative w-[264px] shrink-0 rounded-[2.2rem] border border-border bg-card p-2 shadow-[0_30px_70px_-40px_rgba(20,20,20,0.55)] ${className}`}
    >
      <div className="overflow-hidden rounded-[1.7rem] border border-border bg-background">
        <div className="flex items-center justify-between px-4 pt-2.5 text-[10px] font-medium text-muted-foreground">
          <span>21:14</span>
          <span className="flex items-center gap-1">
            <Wifi className="h-3 w-3" />
            <span className="inline-block h-2 w-4 rounded-[2px] border border-current" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="truncate text-foreground">{label}</span>
      <span className="figure text-muted-foreground">{sub ?? value}</span>
    </div>
  );
}

/** Mockup 1: cuenta del comensal. */
export function BillMockup() {
  return (
    <Phone>
      <div className="px-4 pb-5 pt-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Casa 72</p>
        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">Cuenta Mesa 12</h3>
        <div className="mt-3 border-t border-border pt-2">
          <Row label="Hamburguesa" value="$18,00" />
          <Row label="Pizza" value="$22,00" />
          <Row label="2 Cervezas" value="$12,00" />
          <Row label="Papas" value="$8,00" />
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Row label="Subtotal" value="$60,00" />
          <Row label="Servicio" value="$6,00" />
          <Row label="IVA" value="$9,60" />
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold figure">$75,60</span>
        </div>
        <button className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          ¿Qué quieres pagar?
        </button>
      </div>
    </Phone>
  );
}

/**
 * El panel del restaurante, latiendo.
 *
 * Estaba congelado: cuatro tarjetas con cifras pintadas. Quien compra esto no
 * es el comensal sino quien cuadra la caja, así que esta es la imagen que tiene
 * que parecer un servicio en marcha y no una captura.
 *
 * En bolívares, que es como trabaja el panel de verdad. Las cifras cuentan al
 * aparecer -- y con `prefers-reduced-motion` salen puestas, porque `CountUp` ya
 * lo respeta.
 */
export function DashboardMockup() {
  return (
    <div className="w-full rounded-2xl border border-border bg-card p-5 shadow-[0_30px_70px_-50px_rgba(20,20,20,0.6)]">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Casa 72</p>
          <h3 className="text-base font-semibold tracking-tight">Salón</h3>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
          4 mesas abiertas
        </span>
      </div>

      {/* Las dos cifras que se miran primero al abrir el panel. */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-[11px] text-muted-foreground">Pendiente de cobro</p>
          <p className="mt-1 text-xl font-semibold">
            <CountUp to={185640} decimals={0} suffix=" Bs" />
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-[11px] text-muted-foreground">Ventas hoy</p>
          <p className="mt-1 text-xl font-semibold">
            <CountUp to={1294300} decimals={0} suffix=" Bs" />
          </p>
        </div>
      </div>

      {/* Un aviso de pago llegando. Es el suceso que de verdad interrumpe a
          alguien en sala, y ninguna imagen de la landing lo enseñaba. */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/8 px-4 py-3">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <span className="min-w-0 text-[13px]">Mesa 7 · aviso de pago por verificar</span>
        <span className="ml-auto shrink-0 text-[13px] text-primary">Verificar</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          { t: "Mesa 12", s: "Cuenta abierta", a: "57.200,00 Bs", p: "2 de 4 pagaron", on: true },
          { t: "Mesa 7", s: "Cuenta abierta", a: "31.210,00 Bs", p: "1 de 2 pagaron", on: true },
          { t: "Mesa 3", s: "Cuenta abierta", a: "97.230,00 Bs", p: "Sin pagos", on: false },
          { t: "Mesa 9", s: "Libre", a: "—", p: "QR activo", on: false },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{c.t}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  c.on ? "bg-primary/12 text-primary" : "bg-secondary text-muted-foreground"
                }`}
              >
                {c.s}
              </span>
            </div>
            <p className="mt-3 text-lg font-semibold figure">{c.a}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" /> {c.p}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mockup 4: tarjeta QR de mesa. */
export function QrCardMockup() {
  return (
    <div className="w-[220px] rounded-2xl border border-border bg-card p-6 text-center shadow-[0_24px_60px_-45px_rgba(20,20,20,0.6)]">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Casa 72</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">Mesa 12</p>
      <div className="mx-auto mt-4 flex h-[120px] w-[120px] items-center justify-center rounded-xl border border-border bg-background">
        <QrIcon className="h-16 w-16 text-foreground" strokeWidth={1.2} />
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">Escanea para ver tu cuenta</p>
    </div>
  );
}

/** Pequeña animación de conteo para dar vida sin decorar de más. */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 2,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Quien pidió que nada se moviera ve la cifra, no el conteo. Antes corría
    // igual: la media query sólo tapaba el `.rise` del encabezado.
    if (reduced) {
      setV(to);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 900);
          setV(to * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, reduced]);

  // Formato venezolano: miles con punto, decimales con coma. Sin los miles, una
  // cifra en bolívares es una tira de dígitos que nadie puede leer de un
  // vistazo, que es justo lo que la cifra tiene que permitir.
  const text = v.toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className="figure">
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/**
 * Los tres comensales del ejemplo, y de quién es cada cosa.
 *
 * Tres y no dos porque el caso que duele no es partir por la mitad: es que uno
 * pidió la pizza, otro tomó dos cervezas y las papas se comparten. Y los
 * colores salen de los tokens de marca -- no hay una paleta nueva para esto.
 */
const PAYERS = [
  { id: "a", name: "Ana", chip: "bg-primary text-primary-foreground" },
  { id: "c", name: "Carlos", chip: "bg-foreground text-background" },
  { id: "p", name: "Pedro", chip: "border border-border bg-secondary text-foreground" },
] as const;

const HERO_ITEMS = [
  { name: "Hamburguesa", usd: 18, payer: "c" },
  { name: "Pizza", usd: 22, payer: "a" },
  { name: "Cervezas", usd: 12, payer: "p" },
  { name: "Papas", usd: 8, payer: "p" },
] as const;

const HERO_TOTAL = HERO_ITEMS.reduce((a, i) => a + i.usd, 0) * 1.26;

/**
 * La cuenta repartiéndose sola, en bucle.
 *
 * Es el argumento entero del producto en seis segundos y por encima del
 * pliegue: cuatro líneas que se van poniendo a nombre de tres personas mientras
 * lo pendiente baja hasta cero y la mesa queda libre. Sustituye a un mockup
 * quieto que enseñaba una cuenta y pedía que te imaginaras el resto.
 *
 * **Con `prefers-reduced-motion` no se apaga: se adelanta.** Queda en el
 * fotograma donde las cuatro líneas ya tienen dueño, que es el que cuenta la
 * historia. Una versión «quieta» de esto sería una cuenta sin repartir, es
 * decir, el problema en vez de la solución.
 */
export function LiveSplitMockup({ currency }: { currency: "USD" | "VES" }) {
  const reduced = useReducedMotion();
  // 0 = nadie ha elegido · 1-4 = se van reclamando · 5 = mesa libre
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStep(4);
      return;
    }
    // El cierre se queda más rato en pantalla: es el final y es lo que hay que
    // leer. Los pasos intermedios sólo tienen que dejarse ver.
    const hold = step === 5 ? 2200 : step === 0 ? 900 : 1000;
    const id = setTimeout(() => setStep((s) => (s + 1) % 6), hold);
    return () => clearTimeout(id);
  }, [step, reduced]);

  const claimed = Math.min(step, 4);
  const settled = step === 5;
  const pending = settled ? 0 : HERO_TOTAL * (1 - claimed / 4);

  return (
    <Phone>
      <div className="px-4 pb-5 pt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Casa 72</p>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] transition-colors duration-500 ${
              settled ? "bg-primary/12 text-primary" : "bg-secondary text-muted-foreground"
            }`}
          >
            {settled ? "Mesa libre" : `${claimed} de 4 pagaron`}
          </span>
        </div>
        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">Cuenta Mesa 12</h3>

        <div className="mt-3 space-y-1 border-t border-border pt-2">
          {HERO_ITEMS.map((item, i) => {
            const on = i < claimed;
            const payer = PAYERS.find((p) => p.id === item.payer)!;
            return (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2 py-1 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {/* El hueco está siempre reservado, así que al llegar el
                      nombre nada se desplaza: una fila que salta mientras se
                      lee es lo que hace que un mockup parezca roto. */}
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-semibold transition-all duration-500 ${
                        on ? `${payer.chip} scale-100 opacity-100` : "scale-50 opacity-0"
                      }`}
                    >
                      {payer.name[0]}
                    </span>
                  </span>
                  <span
                    className={`truncate transition-opacity duration-500 ${on ? "" : "opacity-55"}`}
                  >
                    {item.name}
                  </span>
                </span>
                <span className="figure shrink-0 text-muted-foreground">
                  {money(item.usd, currency)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-muted-foreground">
              {settled ? "Cobrado" : "Pendiente"}
            </span>
            <span
              className={`figure text-lg font-semibold transition-colors duration-500 ${
                settled ? "text-primary" : ""
              }`}
            >
              {money(settled ? HERO_TOTAL : pending, currency)}
            </span>
          </div>
          {/* Una barra y no un número más: lo que se quiere ver de un vistazo es
              cuánto falta, no cuánto es. */}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${settled ? 100 : (claimed / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </Phone>
  );
}

/**
 * Bolívares o dólares, y la tasa a la que se convierte.
 *
 * El control más importante de la página y el más pequeño. La doble moneda es
 * lo más venezolano que hace el producto -- la cuenta se lleva en una y se
 * cobra en las dos, a la tasa del día -- y en la página de venta no aparecía
 * por ningún lado: todos los ejemplos estaban en dólares, como si esto se
 * vendiera en Austin.
 *
 * Interactivo y no animado a propósito: lo acciona quien mira, así que se
 * acuerda. Una animación que alterna sola se lee como un adorno.
 */
export function CurrencyToggle({
  value,
  onChange,
}: {
  value: "USD" | "VES";
  onChange: (v: "USD" | "VES") => void;
}) {
  return (
    <div className="inline-flex items-center gap-3">
      <div
        role="group"
        aria-label="Moneda de los ejemplos"
        className="inline-flex rounded-full border border-border bg-card p-0.5"
      >
        {(["VES", "USD"] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={`min-h-9 rounded-full px-4 text-[13px] font-medium transition-colors ${
              value === c
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "VES" ? "Bs" : "$"}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        Ejemplo · tasa BCV {DEMO_RATE.toFixed(2).replace(".", ",")}
      </span>
    </div>
  );
}

/**
 * El cobro entrando, paso a paso.
 *
 * Es la sección que la landing no tenía y la objeción que no contestaba: «¿y
 * cómo me pagan?». Hasta ahora la respuesta impresa era un chip que decía
 * «Pagos integrados próximamente», cuando C2P de Mercantil lleva meses en
 * producción y cobra de la cuenta del propio comensal.
 *
 * Los tres pasos son los tres de verdad -- banco, clave, cobro --, y el que
 * Splite no controla (pedirle la clave a tu banco) está dicho, porque
 * esconderlo convierte la primera demo real en una sorpresa.
 */
export function C2PMockup() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStep(3);
      return;
    }
    const hold = step === 3 ? 2400 : step === 2 ? 1100 : 1400;
    const id = setTimeout(() => setStep((s) => (s + 1) % 4), hold);
    return () => clearTimeout(id);
  }, [step, reduced]);

  return (
    <Phone>
      <div className="px-4 pb-5 pt-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Tu parte</p>
        <h3 className="mt-0.5 text-lg font-semibold tracking-tight figure">1.135,00 Bs</h3>

        <div className="mt-4 space-y-2">
          <div
            className={`rounded-xl border px-3 py-2.5 transition-all duration-500 ${
              step >= 0 ? "border-border bg-card" : "border-border bg-card opacity-40"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Banco</p>
            <p className="mt-0.5 text-[13px]">
              {step >= 1 ? "Mercantil · 0105" : "Elige tu banco"}
            </p>
          </div>

          <div
            className={`rounded-xl border px-3 py-2.5 transition-all duration-500 ${
              step >= 1 ? "border-border bg-card opacity-100" : "border-border bg-card opacity-40"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Clave de pago
            </p>
            <p className="mt-0.5 figure text-[13px] tracking-[0.3em]">
              {step >= 2 ? "••••••" : " "}
            </p>
          </div>
        </div>

        <div
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-500 ${
            step >= 3 ? "bg-primary/12 text-primary" : "bg-primary text-primary-foreground"
          }`}
        >
          {step >= 3 ? (
            <>
              <Check className="h-4 w-4" /> Cobrado
            </>
          ) : step === 2 ? (
            "Cobrando…"
          ) : (
            "Pagar"
          )}
        </div>

        <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
          La clave la pide el comensal a su banco.
          <br />
          Splite nunca la guarda.
        </p>
      </div>
    </Phone>
  );
}
