import { useI18n } from "@/lib/i18n";

/**
 * Dónde está el comensal de los tres pasos.
 *
 * Los pasos existían en el estado y no en la pantalla: se avanzaba con un botón
 * que cambiaba de texto, y lo único que decía cuántos quedaban era haberlos
 * recorrido antes. Tres palabras arriba responden «¿cuánto falta?» sin que
 * nadie tenga que preguntarlo.
 *
 * Una línea de texto y no una barra con círculos y números: es un pago de
 * treinta segundos en una mesa, no el alta de un banco. El paso hecho pierde su
 * número y gana una marca, el actual va en verde, y el que falta se queda en
 * gris -- tres estados que se distinguen sin leerlos.
 *
 * `aria-current` es lo que hace que un lector de pantalla diga cuál es el paso
 * de ahora; sin eso esto son tres palabras sueltas.
 */

type Props = {
  /** 1 reparto, 2 propina, 3 pago. */
  current: 1 | 2 | 3;
};

export function GuestStepIndicator({ current }: Props) {
  const { t } = useI18n();
  const steps = [t("stepSplit"), t("stepTip"), t("stepPay")];

  return (
    <ol className="flex items-center gap-2 py-1" aria-label={t("stepsLabel")}>
      {steps.map((label, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li
            key={label}
            {...(active ? { "aria-current": "step" as const } : {})}
            className="flex items-center gap-2"
          >
            {index > 0 && <span aria-hidden="true" className="h-px w-4 bg-border" />}
            <span
              className={`flex items-center gap-1 text-[11px] uppercase tracking-widest ${
                active ? "font-medium text-primary" : "text-muted-foreground"
              }`}
            >
              {done ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-2.5 w-2.5 text-primary"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
              ) : (
                <span aria-hidden="true">{number}</span>
              )}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
