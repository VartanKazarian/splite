import { useI18n } from "@/lib/i18n";
import { ApiError } from "@/lib/api";

/**
 * Lo que ve un comensal cuando algo sale mal.
 *
 * Las tres pantallas del comensal -- la mesa, la carta y la cuenta -- usaban
 * `ErrorBox`, que es del panel: enseña el código
 * de la API, el mensaje del backend -- en inglés, sobre una pantalla en
 * español -- y el identificador de la petición. Alguien sentado a una mesa,
 * con la cuenta delante, se encontraba con esto:
 *
 *     SPLIT_NOTHING_OUTSTANDING
 *     This bill is already settled, so there is nothing to split
 *     Request ID: e2ff2b7c-039f-4448-90e1-8a4aba63ae7d
 *
 * Un comensal no puede hacer nada con un código ni con un UUID, y el mensaje
 * en inglés encima le decía algo que era falso para él. Aquí no aparece
 * ninguna de las tres cosas: una frase en su idioma, y a quién preguntar.
 *
 * El identificador sigue existiendo -- va en la respuesta y en los logs -- y
 * sigue enseñándose en el panel, que es donde alguien puede usarlo.
 */

/** Sólo los códigos que un comensal puede encontrarse de verdad. */
const GUEST_MESSAGES: Record<string, string> = {
  SPLIT_NOTHING_OUTSTANDING: "guestErrNothingToPay",
  SPLIT_STALE: "guestErrBillChanged",
  BILL_SPLIT_STALE: "guestErrBillChanged",
  SPLIT_ALREADY_EXISTS: "guestErrSplitExists",
  SPLIT_NOT_ACTIVE: "guestErrSplitGone",
  SPLIT_VOIDED: "guestErrSplitGone",
  SPLIT_HAS_PAYMENTS: "guestErrSplitPaid",
  SPLIT_SHARE_OVERPAID: "guestErrSharePaid",
  SPLIT_AMOUNT_MISMATCH: "guestErrAmountMismatch",
  SPLIT_CLAIMS_INCOMPLETE: "guestErrItemsLeft",
  SPLIT_PARTICIPANTS_INVALID: "guestErrParticipants",
  BILL_NOT_OPEN: "guestErrBillClosed",
  OPEN_BILL_NOT_FOUND: "guestErrBillClosed",
};

export function GuestError({ error }: { error: unknown }) {
  const { t } = useI18n();
  const code = error instanceof ApiError ? error.code : null;
  const key = code ? GUEST_MESSAGES[code] : undefined;

  return (
    <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <p className="text-sm">{key ? t(key as never) : t("guestErrGeneric")}</p>
      {/* Qué hacer ahora. Un aviso que sólo dice que algo falló deja a alguien
          mirando el teléfono en vez de levantar la mano. */}
      <p className="mt-1 text-xs text-muted-foreground">{t("guestErrAskStaff")}</p>
    </div>
  );
}
