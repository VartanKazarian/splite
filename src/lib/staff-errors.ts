import { ApiError } from "@/lib/api";
import type { Key } from "@/lib/i18n";
import "@/lib/i18n-errors";

/**
 * Un error del servidor, en una frase para el personal.
 *
 * El panel enseñaba `CÓDIGO · mensaje` tal cual llegaba de la API: el código en
 * mayúsculas y el mensaje del backend en inglés, sobre un panel en español
 * («FORBIDDEN_ROLE · Your role cannot perform this action»). Ahora:
 *
 * - sin respuesta del servidor: que no hay conexión;
 * - un código que el personal se puede encontrar: su frase, en su idioma;
 * - cualquier otro: una frase genérica con el código, para dárselo a soporte.
 *
 * El mensaje en inglés del backend no se enseña nunca; sigue en la respuesta y
 * en los registros.
 */
const STAFF_MESSAGES: Record<string, Key> = {
  FORBIDDEN_ROLE: "errForbiddenRole",
  AUTH_TOKEN_MISSING: "errAuthTokenMissing",
  AUTH_TOKEN_INVALID: "errAuthTokenInvalid",
  CROSS_TENANT_DENIED: "errCrossTenantDenied",
  PLAN_UPGRADE_REQUIRED: "errPlanUpgradeRequired",
  PLAN_DOWNGRADE_BLOCKED: "errPlanDowngradeBlocked",
  SUBSCRIPTION_SUSPENDED: "errSubscriptionSuspended",
  NOT_FOUND: "errNotFound",
  TABLE_NOT_FOUND: "errTableNotFound",
  BILL_NOT_FOUND: "errBillNotFound",
  BILL_ITEM_NOT_FOUND: "errBillItemNotFound",
  PRODUCT_NOT_FOUND: "errProductNotFound",
  CATEGORY_NOT_FOUND: "errCategoryNotFound",
  PAYMENT_NOT_FOUND: "errPaymentNotFound",
  PAYMENT_CLAIM_NOT_FOUND: "errPaymentClaimNotFound",
  STAFF_NOT_FOUND: "errStaffNotFound",
  GUEST_ORDER_NOT_FOUND: "errGuestOrderNotFound",
  OPEN_BILL_EXISTS: "errOpenBillExists",
  OPEN_BILL_NOT_FOUND: "errOpenBillNotFound",
  BILL_NOT_OPEN: "errBillNotOpen",
  BILL_NOT_ITEMISED: "errBillNotItemised",
  BILL_HAS_PAYMENTS: "errBillHasPayments",
  BILL_ALREADY_SERVED: "errBillAlreadyServed",
  TOTAL_BELOW_AMOUNT_PAID: "errTotalBelowAmountPaid",
  PRODUCT_INACTIVE: "errProductInactive",
  PRODUCT_NAME_TAKEN: "errProductNameTaken",
  PRODUCT_TAX_CONFLICT: "errProductTaxConflict",
  CATEGORY_NAME_TAKEN: "errCategoryNameTaken",
  TABLE_NAME_TAKEN: "errTableNameTaken",
  MENU_CURRENCY_MISMATCH: "errMenuCurrencyMismatch",
  PAYMENT_EXCEEDS_BALANCE: "errPaymentExceedsBalance",
  PAYMENT_HELD: "errPaymentHeld",
  PAYMENT_STATE_INVALID: "errPaymentStateInvalid",
  PAYMENT_CLAIM_NOT_PENDING: "errPaymentClaimNotPending",
  PAYMENT_REFERENCE_ALREADY_USED: "errPaymentReferenceAlreadyUsed",
  BANK_MOVEMENT_ALREADY_USED: "errBankMovementAlreadyUsed",
  INVALID_AMOUNT: "errInvalidAmount",
  INVALID_MONETARY_VALUE: "errInvalidMonetaryValue",
  SPLIT_HAS_PAYMENTS: "errSplitHasPayments",
  SPLIT_NOTHING_OUTSTANDING: "errSplitNothingOutstanding",
  GUEST_ORDER_ALREADY_DECIDED: "errGuestOrderAlreadyDecided",
  STAFF_EMAIL_TAKEN: "errStaffEmailTaken",
  INVITATION_EMAIL_IN_USE: "errInvitationEmailInUse",
  STAFF_OUTRANKED: "errStaffOutranked",
  STAFF_ROLE_TOO_HIGH: "errStaffRoleTooHigh",
  STAFF_SELF_FORBIDDEN: "errStaffSelfForbidden",
  STAFF_LAST_OWNER: "errStaffLastOwner",
  PASSWORD_UNCHANGED: "errPasswordUnchanged",
  INVALID_CREDENTIALS: "errInvalidCredentials",
  MFA_CODE_INVALID: "errMfaCodeInvalid",
  MFA_ALREADY_ENABLED: "errMfaAlreadyEnabled",
  MFA_NOT_ENABLED: "errMfaNotEnabled",
  MFA_NOT_ENROLLED: "errMfaNotEnrolled",
  MFA_KEY_MISSING: "errMfaKeyMissing",
  FISCAL_RIF_MALFORMED: "errFiscalRifMalformed",
  FISCAL_RIF_TAKEN: "errFiscalRifTaken",
  FISCAL_RIF_LOCKED: "errFiscalRifLocked",
  FISCAL_RIF_MISSING: "errFiscalRifMissing",
  FISCAL_SERIES_MISSING: "errFiscalSeriesMissing",
  FISCAL_SERIES_LOCKED: "errFiscalSeriesLocked",
  FISCAL_RANGE_EXHAUSTED: "errFiscalRangeExhausted",
  FISCAL_ALREADY_REQUESTED: "errFiscalAlreadyRequested",
  FISCAL_NOTHING_TO_DECLARE: "errFiscalNothingToDeclare",
  FISCAL_PROVIDER_NOT_CONFIGURED: "errFiscalProviderNotConfigured",
  BANK_CONNECTION_RIF_TAKEN: "errBankConnectionRifTaken",
  BANK_CONNECTION_KIND_MISMATCH: "errBankConnectionKindMismatch",
  PAYMENT_CREDENTIALS_KEY_MISSING: "errPaymentCredentialsKeyMissing",
  PAYMENT_PROVIDER_MISCONFIGURED: "errPaymentProviderMisconfigured",
  FX_UNAVAILABLE: "errFxUnavailable",
  MENU_OCR_UNSUPPORTED_MEDIA: "errMenuOcrUnsupportedMedia",
  MENU_OCR_FILE_TOO_LARGE: "errMenuOcrFileTooLarge",
  MENU_OCR_PDF_UNREADABLE: "errMenuOcrPdfUnreadable",
  MENU_OCR_NOT_CONFIGURED: "errMenuOcrNotConfigured",
  MENU_OCR_UNAVAILABLE: "errMenuOcrUnavailable",
  MENU_OCR_UNREADABLE_RESPONSE: "errMenuOcrUnreadableResponse",
  MENU_PDF_UNSUPPORTED_MEDIA: "errMenuPdfUnsupportedMedia",
  MENU_PDF_FILE_TOO_LARGE: "errMenuPdfFileTooLarge",
  PRODUCT_IMAGE_UNSUPPORTED_MEDIA: "errProductImageUnsupportedMedia",
  PRODUCT_IMAGE_FILE_TOO_LARGE: "errProductImageFileTooLarge",
  BRANDING_UNSUPPORTED_MEDIA: "errBrandingUnsupportedMedia",
  BRANDING_FILE_TOO_LARGE: "errBrandingFileTooLarge",
  PUSH_NOT_SUBSCRIBED: "errPushNotSubscribed",
  PUSH_DISABLED: "errPushDisabled",
  IDEMPOTENCY_IN_FLIGHT: "errIdempotencyInFlight",
  IDEMPOTENCY_KEY_REUSED: "errIdempotencyKeyReused",
  RATE_LIMITER_UNAVAILABLE: "errRateLimiterUnavailable",
  SHUTTING_DOWN: "errShuttingDown",
};

export function staffErrorText(error: unknown, t: (key: Key) => string): string {
  if (!(error instanceof ApiError)) return t("apiDown");
  if (error.code === "VALIDATION_FAILED") return t("errValidation");
  if (error.code === "RATE_LIMITED") {
    const seconds = Number((error.details as { retryAfterSeconds?: unknown })?.retryAfterSeconds);
    return t("errRateLimited").replace(
      "{seconds}",
      String(Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 30),
    );
  }
  const key = STAFF_MESSAGES[error.code];
  return key ? t(key) : t("errGeneric").replace("{code}", error.code);
}

/** Qué se le puede pasar a soporte: el código y el principio del id de la petición. */
export function staffErrorReference(error: unknown, t: (key: Key) => string): string | null {
  if (!(error instanceof ApiError)) return null;
  return t("errReference")
    .replace("{code}", error.code)
    .replace("{ref}", error.requestId ? error.requestId.slice(0, 8) : "—");
}
