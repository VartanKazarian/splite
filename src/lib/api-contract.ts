import type * as Hand from "./api";
import type { components } from "./api-schema.gen";

/**
 * ¿Hablan los tipos de `api.ts` el mismo idioma que el backend?
 *
 * Los tipos de `api.ts` están escritos a mano, y se habían separado del
 * contrato del backend sin que nada avisara: `Account.contactEmail`, la
 * propina de un aviso de pago, campos de la cuenta. Este archivo no genera
 * código; sólo hace que `tsc` falle si un tipo y su esquema del contrato
 * (`contract/openapi.json`, del backend) dejan de tener las mismas claves.
 *
 * Las diferencias que ya existían están abajo, con nombre, en `KNOWN`. Cada una
 * es una de dos cosas: el contrato no documenta algo que el backend sí manda
 * (el arreglo es en el backend), o el frontend agrupa en un tipo lo que el
 * contrato separa en varios. Lo que no está en esa lista rompe el build.
 *
 * Al cambiar el contrato: `bun run api:sync` (lo copia del backend y regenera
 * `api-schema.gen.ts`), y `bun run typecheck` dice qué tipo se quedó atrás.
 */

type S = components["schemas"];

/** Las diferencias conocidas hoy: clave que sobra en un lado u otro. */
type KNOWN = {
  /** Lo añade R20 en el backend (#127). */
  Account: "googleReviewUrl";
  /** El tipo de la cuenta del comensal y el del personal son uno aquí. */
  Bill:
    | "restaurantId"
    | "fxRateSource"
    | "calculationVersion"
    | "items"
    | "tipVes"
    | "heldUntil"
    | "heldVes"
    | "pendingVes"
    | "availableVes"
    | "payee"
    | "fxRate"
    | "payingNow"
    | "pendingClaims"
    | "pendingCount"
    | "myHold"
    | "c2pAvailable"
    | "canRequestInvoice"
    | "itemCount"
    | "openedAt"
    | "openMinutes";
  BillItem: "taxCategory" | "createdAt" | "updatedAt" | "vatBps";
  BillSplit: "updatedAt" | "claims";
  /** El backend acepta `tipVes` (schemas.js) y no lo documenta. */
  C2PChargeRequest: "tipVes";
  /** El backend manda `safeToRetry` y no lo documenta. */
  C2PChargeResult: "safeToRetry";
  MenuSettings: "coverUrl" | "logoUrl" | "openBillsUnaffected" | "vatBps" | "serviceChargeBps";
  /** Un tipo aquí para varias respuestas de cobro del contrato. */
  PaymentResult:
    | "fxSource"
    | "id"
    | "currency"
    | "tipVes"
    | "fxRate"
    | "usdReference"
    | "displayCurrency"
    | "totalChargedVes"
    | "shareDetached";
  ServiceSnapshot: "adjustments";
  SubscriptionNotice:
    | "restaurantName"
    | "restaurantId"
    | "notes"
    | "chargePeriodStart"
    | "submittedBy"
    | "reviewedAt";
};

type Known<N extends string> = N extends keyof KNOWN ? KNOWN[N] : never;

/** Las claves que un lado tiene y el otro no, menos las conocidas. Debe ser `never`. */
type Drift<N extends keyof S & string, H> = Exclude<
  Exclude<keyof S[N], keyof H> | Exclude<keyof H, keyof S[N]>,
  Known<N>
>;

/** Falla al compilar, nombrando las claves, si `T` no es `never`. */
type Same<T extends never> = T;

export type ContractCheck = [
  Same<Drift<"Account", Hand.Account>>,
  Same<Drift<"BankConnection", Hand.BankConnection>>,
  Same<Drift<"BankIngestResult", Hand.BankIngestResult>>,
  Same<Drift<"Bill", Hand.Bill>>,
  Same<Drift<"BillAdjustment", Hand.BillAdjustment>>,
  Same<Drift<"BillItem", Hand.BillItem>>,
  Same<Drift<"BillSplit", Hand.BillSplit>>,
  Same<Drift<"C2PBankClave", Hand.C2PBankClave>>,
  Same<Drift<"C2PChargeRequest", Hand.C2PChargeRequest>>,
  Same<Drift<"C2PChargeResult", Hand.C2PChargeResult>>,
  Same<Drift<"C2PResolution", Hand.C2PResolution>>,
  Same<Drift<"C2PUnresolvedCharge", Hand.C2PUnresolvedCharge>>,
  Same<Drift<"ClaimsSummary", Hand.ClaimsSummary>>,
  Same<Drift<"ExchangeRate", Hand.ExchangeRate>>,
  Same<Drift<"FiscalInvoice", Hand.FiscalInvoice>>,
  Same<Drift<"GuestOrder", Hand.GuestOrder>>,
  Same<Drift<"GuestReceipt", Hand.GuestReceipt>>,
  Same<Drift<"GuestSession", Hand.GuestSession>>,
  Same<Drift<"MenuCategory", Hand.MenuCategory>>,
  Same<Drift<"MenuDocument", Hand.MenuDocument>>,
  Same<Drift<"MenuOcrDraft", Hand.MenuOcrDraft>>,
  Same<Drift<"MenuOcrImportResult", Hand.MenuOcrImportResult>>,
  Same<Drift<"MenuSettings", Hand.MenuSettings>>,
  Same<Drift<"MfaStatus", Hand.MfaStatus>>,
  Same<Drift<"MyTips", Hand.MyTips>>,
  Same<Drift<"PaymentClaim", Hand.PaymentClaim>>,
  Same<Drift<"PaymentHold", Hand.PaymentHold>>,
  Same<Drift<"PaymentProviderConfig", Hand.PaymentProviderConfig>>,
  Same<Drift<"PaymentResult", Hand.PaymentResult>>,
  Same<Drift<"Payout", Hand.Payout>>,
  Same<Drift<"Product", Hand.Product>>,
  Same<Drift<"PublicMenu", Hand.PublicMenu>>,
  Same<Drift<"PublicProduct", Hand.PublicProduct>>,
  Same<Drift<"QrContext", Hand.QrContext>>,
  Same<Drift<"ServiceSnapshot", Hand.ServiceSnapshot>>,
  Same<Drift<"SplitPreview", Hand.SplitPreview>>,
  Same<Drift<"SplitPreviewRequest", Hand.SplitPreviewRequest>>,
  Same<Drift<"StaffInvitation", Hand.StaffInvitation>>,
  Same<Drift<"StaffMember", Hand.StaffMember>>,
  Same<Drift<"SubscriptionNotice", Hand.SubscriptionNotice>>,
  Same<Drift<"Table", Hand.Table>>,
  Same<Drift<"TakingsChannel", Hand.TakingsChannel>>,
  Same<Drift<"TipsReport", Hand.TipsReport>>,
];
