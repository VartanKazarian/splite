import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

export const Route = createFileRoute("/registro")({
  head: () => ({
    meta: [
      { title: "Registra tu restaurante — Splite" },
      {
        name: "description",
        content:
          "Déjanos los datos de tu restaurante y te llamamos para poner en marcha Splite: QR por mesa, división de cuenta y pagos.",
      },
      { property: "og:title", content: "Registra tu restaurante — Splite" },
      {
        property: "og:description",
        content: "Solicita el alta de tu restaurante en Splite. Te llamamos para activarte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Registro,
});

type Currency = "VES" | "USD" | "EUR";
type FieldKey =
  | "restaurantName"
  | "rif"
  | "email"
  | "phone"
  | "tableCount"
  | "staffCount"
  | "monthlyCovers"
  | "posSystem"
  | "notes";

const RIF_MSG =
  "El RIF debe ser una letra (V, E, J, P o G) seguida de 9 dígitos, por ejemplo J-12345678-9.";

function normalizeRif(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const inputClass =
  "mt-2 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-base outline-none focus:border-ring aria-[invalid=true]:border-destructive";
const labelClass = "block text-xs uppercase tracking-widest text-muted-foreground";

function Registro() {
  const [values, setValues] = useState({
    restaurantName: "",
    rif: "",
    email: "",
    phone: "",
    tableCount: "",
    staffCount: "",
    monthlyCovers: "",
    posSystem: "",
    notes: "",
  });
  const [menuCurrency, setMenuCurrency] = useState<Currency>("VES");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<{ text: string; requestId?: string | undefined } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (submittedPhone) successRef.current?.focus();
  }, [submittedPhone]);

  function set(key: FieldKey, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function validate(key: FieldKey, value: string): string | undefined {
    const v = value.trim();
    if (key === "restaurantName") {
      if (v.length < 2 || v.length > 120) return "Escribe el nombre del restaurante (2–120 caracteres).";
    }
    if (key === "rif") {
      if (!/^[VEJPG]\d{9}$/.test(normalizeRif(v))) return RIF_MSG;
    }
    if (key === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254)
        return "Escribe un correo electrónico válido.";
    }
    if (key === "phone") {
      if (!/^[\d+()\-.\s]{7,40}$/.test(v)) return "Escribe un teléfono válido (7–40 caracteres).";
    }
    if (key === "tableCount" && v) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return "Escribe un número entre 1 y 1000.";
    }
    if (key === "staffCount" && v) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 2000) return "Escribe un número entre 1 y 2000.";
    }
    if (key === "monthlyCovers" && v) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 1000000) return "Escribe un número entre 0 y 1.000.000.";
    }
    if (key === "posSystem" && v.length > 120) return "Máximo 120 caracteres.";
    if (key === "notes" && v.length > 2000) return "Máximo 2000 caracteres.";
    return undefined;
  }

  function blur(key: FieldKey) {
    const message = validate(key, values[key]);
    setErrors((e) => ({ ...e, [key]: message }));
  }

  function mapServerFields(fields: unknown): Partial<Record<FieldKey, string>> {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!Array.isArray(fields)) return next;
    const keys: FieldKey[] = [
      "restaurantName",
      "rif",
      "email",
      "phone",
      "tableCount",
      "staffCount",
      "monthlyCovers",
      "posSystem",
      "notes",
    ];
    for (const raw of fields) {
      if (typeof raw !== "string") continue;
      const hit = keys.find((k) => raw.toLowerCase().includes(k.toLowerCase()));
      if (hit) next[hit] = "Revisa este dato.";
    }
    return next;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || cooldown > 0) return;

    const required: FieldKey[] = ["restaurantName", "rif", "email", "phone"];
    const optional: FieldKey[] = ["tableCount", "staffCount", "monthlyCovers", "posSystem", "notes"];
    const next: Partial<Record<FieldKey, string>> = {};
    for (const key of [...required, ...optional]) {
      const message = validate(key, values[key]);
      if (message) next[key] = message;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError({ text: "Revisa los datos del formulario." });
      return;
    }

    const profile: Record<string, string | number> = {};
    if (values.tableCount.trim()) profile['tableCount'] = Number(values.tableCount);
    if (values.staffCount.trim()) profile['staffCount'] = Number(values.staffCount);
    if (values.monthlyCovers.trim()) profile['monthlyCovers'] = Number(values.monthlyCovers);
    if (values.posSystem.trim()) profile['posSystem'] = values.posSystem.trim();
    if (values.notes.trim()) profile['notes'] = values.notes.trim();

    const body: Record<string, unknown> = {
      restaurantName: values.restaurantName.trim(),
      rif: normalizeRif(values.rif),
      email: values.email.trim(),
      phone: values.phone.trim(),
      menuCurrency,
    };
    if (Object.keys(profile).length > 0) body['profile'] = profile;

    setPending(true);
    setFormError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/onboarding/restaurants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.status === 202) {
        setSubmittedPhone(values.phone.trim());
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; details?: Record<string, unknown>; requestId?: string } }
        | null;
      const error = payload?.error;
      const code = error?.code ?? "INTERNAL_ERROR";
      const requestId = error?.requestId;

      if (code === "VALIDATION_FAILED") {
        setErrors((prev) => ({ ...prev, ...mapServerFields(error?.details?.['fields']) }));
        setFormError({ text: "Revisa los datos del formulario.", requestId });
      } else if (code === "RATE_LIMITED") {
        const retry = Number(error?.details?.['retryAfterSeconds']);
        setCooldown(Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60);
        setFormError({
          text: "Demasiados intentos. Vuelve a intentarlo en unos minutos.",
          requestId,
        });
      } else if (code === "RATE_LIMITER_UNAVAILABLE") {
        setFormError({
          text: "No podemos procesar solicitudes en este momento. Intenta de nuevo en unos minutos.",
          requestId,
        });
      } else if (code === "NOT_FOUND") {
        setFormError({
          text: "El registro todavía no está habilitado. Escríbenos a onboarding@splite.app.",
          requestId,
        });
      } else {
        setFormError({ text: "Algo salió mal de nuestro lado. Intenta de nuevo.", requestId });
      }
    } catch {
      setFormError({ text: "Algo salió mal de nuestro lado. Intenta de nuevo." });
    } finally {
      setPending(false);
    }
  }

  const describe = (key: FieldKey, extra?: string) =>
    [errors[key] ? `${key}-error` : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-6">
        <Link to="/" className="font-display text-2xl">
          Splite
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-24">
        {submittedPhone ? (
          <div
            ref={successRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className="surface p-8 outline-none"
          >
            <h1 className="text-3xl">Recibimos tu solicitud</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Un miembro de nuestro equipo va a revisar los datos y te va a llamar al{" "}
              <span className="text-foreground">{submittedPhone}</span> para coordinar la puesta en
              marcha.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              No hace falta que hagas nada más por ahora.
            </p>
            <Link to="/" className="mt-8 inline-block text-sm underline underline-offset-4">
              Volver al inicio
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="surface p-6 sm:p-8">
            <h1 className="text-3xl">Registra tu restaurante</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Déjanos tus datos. Revisamos la solicitud y te llamamos para poner en marcha Splite.
            </p>

            <section className="mt-10">
              <h2 className="text-lg">Tu restaurante</h2>

              <div className="mt-5">
                <label htmlFor="restaurantName" className={labelClass}>
                  Nombre del restaurante
                </label>
                <input
                  id="restaurantName"
                  value={values.restaurantName}
                  onChange={(e) => set("restaurantName", e.target.value)}
                  onBlur={() => blur("restaurantName")}
                  aria-invalid={Boolean(errors.restaurantName)}
                  aria-describedby={describe("restaurantName")}
                  className={inputClass}
                />
                {errors.restaurantName && (
                  <p id="restaurantName-error" className="mt-2 text-xs text-destructive">
                    {errors.restaurantName}
                  </p>
                )}
              </div>

              <div className="mt-5">
                <label htmlFor="rif" className={labelClass}>
                  RIF
                </label>
                <input
                  id="rif"
                  placeholder="J-12345678-9"
                  value={values.rif}
                  onChange={(e) => set("rif", e.target.value)}
                  onBlur={() => blur("rif")}
                  aria-invalid={Boolean(errors.rif)}
                  aria-describedby={describe("rif")}
                  className={inputClass}
                />
                {errors.rif && (
                  <p id="rif-error" className="mt-2 text-xs text-destructive">
                    {errors.rif}
                  </p>
                )}
              </div>

              <div className="mt-5">
                <span className={labelClass} id="menuCurrency-label">
                  ¿En qué moneda están los precios de tu menú?
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="menuCurrency-label"
                  aria-describedby="menuCurrency-help"
                  className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"
                >
                  {(
                    [
                      ["VES", "Bolívares (VES)"],
                      ["USD", "Dólares (USD)"],
                      ["EUR", "Euros (EUR)"],
                    ] as const
                  ).map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      role="radio"
                      aria-checked={menuCurrency === code}
                      onClick={() => setMenuCurrency(code)}
                      className={`rounded-lg border px-4 py-3 text-base transition-colors ${
                        menuCurrency === code
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-input bg-secondary text-muted-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p id="menuCurrency-help" className="mt-2 text-xs text-muted-foreground">
                  Splite siempre cobra en bolívares. Esto solo indica en qué moneda están escritos
                  tus precios.
                </p>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg">¿Cómo te contactamos?</h2>

              <div className="mt-5">
                <label htmlFor="email" className={labelClass}>
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => blur("email")}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={describe("email")}
                  className={inputClass}
                />
                {errors.email && (
                  <p id="email-error" className="mt-2 text-xs text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="mt-5">
                <label htmlFor="phone" className={labelClass}>
                  Teléfono
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+58 412 1234567"
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  onBlur={() => blur("phone")}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={describe("phone", "phone-help")}
                  className={inputClass}
                />
                <p id="phone-help" className="mt-2 text-xs text-muted-foreground">
                  Te vamos a llamar a este número.
                </p>
                {errors.phone && (
                  <p id="phone-error" className="mt-2 text-xs text-destructive">
                    {errors.phone}
                  </p>
                )}
              </div>
            </section>

            <section className="mt-10 rounded-xl border border-border/60 p-4">
              <button
                type="button"
                onClick={() => setOptionalOpen((o) => !o)}
                aria-expanded={optionalOpen}
                className="flex w-full items-center justify-between text-left"
              >
                <span>
                  <span className="text-lg">Cuéntanos de tu operación</span>
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Opcional
                  </span>
                </span>
                <span className="text-muted-foreground">{optionalOpen ? "−" : "+"}</span>
              </button>

              {optionalOpen && (
                <div className="mt-5">
                  {(
                    [
                      ["tableCount", "¿Cuántas mesas tienes?"],
                      ["staffCount", "¿Cuántas personas trabajan en el restaurante?"],
                      ["monthlyCovers", "¿Cuántos clientes atiendes al mes, más o menos?"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="mb-5">
                      <label htmlFor={key} className={labelClass}>
                        {label}
                      </label>
                      <input
                        id={key}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={values[key]}
                        onChange={(e) => set(key, e.target.value.replace(/\D/g, ""))}
                        onBlur={() => blur(key)}
                        aria-invalid={Boolean(errors[key])}
                        aria-describedby={describe(key)}
                        className={inputClass}
                      />
                      {errors[key] && (
                        <p id={`${key}-error`} className="mt-2 text-xs text-destructive">
                          {errors[key]}
                        </p>
                      )}
                    </div>
                  ))}

                  <div className="mb-5">
                    <label htmlFor="posSystem" className={labelClass}>
                      ¿Qué usas hoy para las cuentas?
                    </label>
                    <input
                      id="posSystem"
                      placeholder="Un POS, Excel, cuaderno..."
                      maxLength={120}
                      value={values.posSystem}
                      onChange={(e) => set("posSystem", e.target.value)}
                      onBlur={() => blur("posSystem")}
                      aria-invalid={Boolean(errors.posSystem)}
                      aria-describedby={describe("posSystem")}
                      className={inputClass}
                    />
                    {errors.posSystem && (
                      <p id="posSystem-error" className="mt-2 text-xs text-destructive">
                        {errors.posSystem}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="notes" className={labelClass}>
                      ¿Algo más que debamos saber?
                    </label>
                    <textarea
                      id="notes"
                      rows={4}
                      maxLength={2000}
                      value={values.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      onBlur={() => blur("notes")}
                      aria-invalid={Boolean(errors.notes)}
                      aria-describedby={describe("notes")}
                      className={inputClass}
                    />
                    {values.notes.length > 1800 && (
                      <p className="mt-2 text-right text-xs text-muted-foreground">
                        {values.notes.length} / 2000
                      </p>
                    )}
                    {errors.notes && (
                      <p id="notes-error" className="mt-2 text-xs text-destructive">
                        {errors.notes}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {formError && (
              <div
                role="alert"
                className="mt-8 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
              >
                <p className="text-destructive">{formError.text}</p>
                {formError.requestId && (
                  <p className="mt-2 select-all font-mono text-[11px] text-muted-foreground">
                    Referencia: {formError.requestId}
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={pending || cooldown > 0}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              )}
              {pending
                ? "Enviando..."
                : cooldown > 0
                  ? `Espera ${cooldown}s`
                  : "Enviar solicitud"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
