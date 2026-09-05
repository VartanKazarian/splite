import { useEffect, useRef, useState } from "react";
import { Check, QrCode as QrIcon, Users, Wifi } from "lucide-react";

/** Marco de teléfono realista para los mockups de producto. */
export function Phone({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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

const SPLIT_ITEMS = [
  { id: "a", name: "Hamburguesa", price: 18 },
  { id: "b", name: "Pizza", price: 22 },
  { id: "c", name: "Cervezas", price: 12 },
  { id: "d", name: "Papas", price: 8 },
];

/** Mockup 2: selección por producto, interactivo de verdad (sin backend). */
export function SplitMockup() {
  const [picked, setPicked] = useState<string[]>(["a", "c"]);
  const total = SPLIT_ITEMS.filter((i) => picked.includes(i.id)).reduce((a, i) => a + i.price, 0);
  const withCharges = total * 1.26;

  return (
    <Phone>
      <div className="px-4 pb-5 pt-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mesa 12</p>
        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">Elige lo que consumiste</h3>
        <div className="mt-3 space-y-2">
          {SPLIT_ITEMS.map((i) => {
            const on = picked.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPicked((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]))
                }
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all duration-200 ${
                  on
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/20"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`flex h-4.5 w-4.5 items-center justify-center rounded-md border transition-colors ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                    style={{ height: 18, width: 18 }}
                  >
                    {on ? <Check className="h-3 w-3" /> : null}
                  </span>
                  {i.name}
                </span>
                <span className="figure">${i.price},00</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 rounded-xl border border-border bg-secondary px-3 py-3">
          <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
            <span>Tu parte</span>
            <span className="figure">${total.toFixed(2).replace(".", ",")}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-[12px] text-muted-foreground">Con servicio e IVA</span>
            <span className="text-lg font-semibold figure">
              ${withCharges.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>
      </div>
    </Phone>
  );
}

/** Mockup 3: panel del restaurante. */
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          { t: "Mesa 12", s: "Cuenta abierta", a: "$75,60", p: "2 de 4 pagaron", on: true },
          { t: "Mesa 7", s: "Cuenta abierta", a: "$41,20", p: "1 de 2 pagaron", on: true },
          { t: "Mesa 3", s: "Cuenta abierta", a: "$128,00", p: "Sin pagos", on: false },
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
            <p className="mt-3 text-xl font-semibold figure">{c.a}</p>
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
export function CountUp({ to, prefix = "", decimals = 2 }: { to: number; prefix?: string; decimals?: number }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 900);
        setV(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return (
    <span ref={ref} className="figure">
      {prefix}
      {v.toFixed(decimals).replace(".", ",")}
    </span>
  );
}
