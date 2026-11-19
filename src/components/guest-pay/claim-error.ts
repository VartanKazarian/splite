import { ApiError, NetworkError, formatMinor } from "@/lib/api";
import "@/lib/i18n-guest";

/*
 * Los errores del aviso «Ya pagué», en palabras del comensal. Ver
 * `GuestPaymentPanel`.
 */

/**
 * Cada campo del formulario, y la frase que explica qué se espera de él.
 *
 * Las claves son los nombres que manda el servidor en `details.fieldPaths`, no
 * los `id` del formulario: son lo único que no cambia cuando alguien reescribe
 * una etiqueta.
 */
const FIELD_PROBLEMS: Record<string, string> = {
  amountVes: "guestErrBadAmount",
  amount: "guestErrBadAmount",
  reference: "guestErrBadReference",
  phoneOrigin: "guestErrBadPhone",
  bankOrigin: "guestErrBadBank",
  idOrigin: "guestErrBadId",
  tipVes: "guestErrBadTip",
  "invoice.email": "invoiceEmailBad",
  "invoice.taxId": "invoiceTaxIdBad",
  "invoice.name": "invoiceNameBad",
};

export type ClaimError = {
  code?: string;
  message: string;
  requestId?: string;
  fields?: string[];
  suggestVes?: string;
};

/** El traductor va por parámetro: esto no es un componente y no puede usar el hook. */
export function toClaimError(error: unknown, t: (k: never) => string): ClaimError {
  const say = (k: string) => t(k as never);
  if (error instanceof NetworkError) {
    return { message: say(error.kind === "timeout" ? "claimMaybeSent" : "offlineRetry") };
  }
  if (!(error instanceof ApiError)) {
    return { message: say("guestErrRetry") };
  }
  const details = (error.details ?? {}) as Record<string, unknown>;
  const base = { code: error.code, requestId: error.requestId };
  switch (error.code) {
    case "PAYMENT_REFERENCE_ALREADY_USED":
      return {
        ...base,
        message: say("guestErrRefUsed"),
        fields: ["reference"],
      };
    case "PAYMENT_EXCEEDS_BALANCE": {
      const remaining =
        typeof details["remainingVes"] === "string" ? details["remainingVes"] : undefined;
      return {
        ...base,
        message: say("guestErrTooMuch").replace(
          "{amount}",
          `${remaining ? formatMinor(remaining) : "—"} Bs`,
        ),
        fields: ["amount"],
        ...(remaining ? { suggestVes: remaining } : {}),
      };
    }
    case "BILL_NOT_OPEN":
    case "OPEN_BILL_NOT_FOUND":
      return { ...base, message: say("c2pErrClosed") };
    case "VALIDATION_FAILED": {
      /*
       * Qué casilla está mal, y por qué, en castellano.
       *
       * Esto leía `details.fields`, que son los mensajes de Joi, y los
       * comparaba con nombres de campo: `fields.includes("reference")` nunca
       * era cierto porque la lista trae frases enteras en inglés. El resultado
       * era "Revisa los datos." sin ninguna casilla marcada -- cinco casillas
       * delante y ninguna pista de cuál --, que es justo lo que se veía al
       * escribir un teléfono que no es venezolano.
       *
       * `fieldPaths` viene del validador y nombra el campo pase lo que pase con
       * la redacción del mensaje. `fields` se sigue leyendo de respaldo, por si
       * la respuesta viene de un servidor anterior a ese añadido.
       */
      const paths = details["fieldPaths"];
      const fields = Array.isArray(paths)
        ? paths.map(String)
        : Array.isArray(details["fields"])
          ? (details["fields"] as unknown[]).map(String)
          : [];

      const named = fields.map((f) => FIELD_PROBLEMS[f]).filter(Boolean) as string[];
      return {
        ...base,
        // Una casilla mal: se dice cuál y qué se espera. Varias: se dice
        // cuántas y se marcan todas, porque cuatro frases seguidas en un aviso
        // rojo no se leen.
        message:
          named.length === 1
            ? say(named[0]!)
            : named.length > 1
              ? say("guestErrFieldsN").replace("{n}", String(named.length))
              : say("guestErrFields"),
        fields,
      };
    }
    case "GUEST_SESSION_INVALID":
    case "GUEST_SESSION_MISSING":
      return {
        ...base,
        message: say("c2pErrSession"),
      };
    case "RATE_LIMITED":
      return { ...base, message: say("c2pErrTooMany") };
    default:
      return { ...base, message: say("guestErrRetry") };
  }
}

/** «14:32», en la hora del teléfono del comensal. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}
