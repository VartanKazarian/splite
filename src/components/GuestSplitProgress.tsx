import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { formatMoney, guest, type BillSplit } from "@/lib/api";
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
  /** Que la lista se relea cuando una parte cambia de nombre. */
  onChanged: () => void;
  /** La referencia de la parte que dijo pagar quien está mirando, si eligió una. */
  mineRef: string | null;
  onPick: (ref: string) => void;
};

export function GuestSplitProgress({ split, mineRef, onPick, onChanged }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");

  const mine = split.participants.find((p) => p.ref === mineRef) ?? null;

  const rename = useMutation({
    mutationFn: () => guest.nameShare(mineRef ?? "", name.trim()),
    onSuccess: () => {
      setName("");
      onChanged();
    },
  });

  const settled = split.participants.filter((p) => p.settled).length;
  const total = split.participants.length;
  const pct = total === 0 ? 0 : Math.round((settled / total) * 100);

  return (
    <div className="surface mt-4 p-6">
      <h2 className="text-xl font-semibold">{t("splitAgreed")}</h2>

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
                data-testid={`guest-share-${i}`}
                aria-pressed={isMine}
                onClick={() => onPick(p.ref)}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left transition-colors ${
                  isMine
                    ? "border-primary bg-primary/10"
                    : "border-border-strong bg-card hover:bg-secondary"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    p.settled
                      ? "bg-primary text-primary-foreground"
                      : "border-[1.5px] border-border-strong"
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
                  <span className="money-md block">{formatMoney(p.amountVes, "VES")}</span>
                  {!p.settled && BigInt(p.amountPaidVes) > 0n && (
                    <span className="money-sm block text-muted-foreground">
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
      {!mineRef && <p className="hint mt-3">{t("pickYourShare")}</p>}

      {/* Y el nombre se pide justo aquí, a quien acaba de tomar una parte: el
          momento en que empieza a servir de algo. Sólo si esa parte no tiene
          nombre ya y no ha recibido dinero -- después el servidor lo rechaza,
          así que ofrecer el campo sería ofrecer un 409. */}
      {mine && !mine.name && !mine.settled && BigInt(mine.amountPaidVes) === 0n && (
        <form
          className="mt-4 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) rename.mutate();
          }}
        >
          <label className="field-label block">
            {t("yourNameOptional")}
            <input
              data-testid="guest-share-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="given-name"
              placeholder={t("yourNamePlaceholder")}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-base font-normal outline-none focus:border-ring"
            />
          </label>
          <button
            type="submit"
            data-testid="guest-share-name-save"
            disabled={!name.trim() || rename.isPending}
            className="btn-choice mt-2 w-full"
          >
            {rename.isPending ? t("loading") : t("saveName")}
          </button>
        </form>
      )}
    </div>
  );
}
