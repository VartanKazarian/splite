import { formatMoney, type BillSplit } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/**
 * Cómo va la cuenta entre los que la comparten.
 *
 * La lista existía y era correcta, pero se leía como cuatro transferencias
 * sueltas: cada parte con su estado al lado y nada que dijera cuánto falta para
 * cerrar la mesa. Una barra y una línea -- «3 de 4 han pagado» -- convierten
 * cuatro filas en una situación.
 *
 * La proporción se calcula sobre las partes pagadas y no sobre el dinero: son
 * dos preguntas distintas y la que se hace en una mesa es cuánta gente falta.
 * Ninguno de los dos números se inventa aquí; los dos vienen del reparto que
 * devuelve el servidor.
 *
 * Y se traduce. Los textos estaban escritos a pelo en castellano dentro del
 * componente -- «Pendiente», «Comensal», «Toca la parte que vas a pagar» --, de
 * modo que en inglés la pantalla salía a medias en español.
 */

type Props = {
  split: BillSplit;
  /** La referencia de la parte que dijo pagar quien está mirando, si eligió una. */
  mineRef: string | null;
  onPick: (ref: string) => void;
};

export function GuestSplitProgress({ split, mineRef, onPick }: Props) {
  const { t } = useI18n();

  const settled = split.participants.filter((p) => p.settled).length;
  const total = split.participants.length;
  const pct = total === 0 ? 0 : Math.round((settled / total) * 100);

  return (
    <div className="surface mt-4 p-6">
      <h2 className="text-xl">{t("splitAgreed")}</h2>

      <div
        role="progressbar"
        aria-valuenow={settled}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={t("splitPaidCount")
          .replace("{done}", String(settled))
          .replace("{total}", String(total))}
        className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("splitPaidCount").replace("{done}", String(settled)).replace("{total}", String(total))}
      </p>

      <ul className="mt-4 space-y-2 text-sm">
        {split.participants.map((p, i) => {
          const isMine = p.ref === mineRef;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={isMine}
                onClick={() => onPick(p.ref)}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isMine ? "border-primary bg-primary/[0.06]" : "border-border"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    p.settled ? "bg-primary text-primary-foreground" : "border border-input"
                  }`}
                >
                  {p.settled && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3"
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {p.name ?? (isMine ? t("yourShare") : `${t("diner")} ${i + 1}`)}
                </span>
                <span className="shrink-0 text-right">
                  <span className="money-sm block">{formatMoney(p.amountVes, "VES")}</span>
                  {!p.settled && BigInt(p.amountPaidVes) > 0n && (
                    <span className="money-sm block text-[11px] text-muted-foreground">
                      {t("stillOwes").replace("{amount}", formatMoney(p.remainingVes, "VES"))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Sólo mientras haga falta: quien ya eligió su parte no necesita que se
          le explique cómo elegirla. */}
      {!mineRef && <p className="mt-3 text-[11px] text-muted-foreground">{t("pickYourShare")}</p>}
    </div>
  );
}
