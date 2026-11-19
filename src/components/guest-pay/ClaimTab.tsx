import { useI18n } from "@/lib/i18n";
import { formatMinor, type Bill, type BankRef, type PaymentClaim } from "@/lib/api";
import { GuestClaimCard } from "@/components/guest-pay/GuestClaimCard";
import type { ClaimFormState } from "@/components/guest-pay/useClaimForm";
import "@/lib/i18n-guest";

const field =
  "mt-1.5 min-h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-base outline-none focus:border-ring aria-[invalid=true]:border-destructive";

/**
 * La pestaña «Ya pagué»: la cuenta pagada, el aviso ya enviado o el formulario
 * para avisar. Lo escrito vive en `useClaimForm`, que llama el panel.
 */
export function ClaimTab({
  form,
  bill,
  demo,
  billPaid,
  claim,
  onDeclareAgain,
}: {
  form: ClaimFormState;
  bill: Bill;
  demo: boolean;
  billPaid: boolean;
  claim: PaymentClaim | null;
  onDeclareAgain: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-5">
      {billPaid ? (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-4">
          <p className="text-xl font-semibold tracking-tight">{t("billSettledTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("guestNothingLeft")}</p>
        </div>
      ) : claim ? (
        <GuestClaimCard
          claim={claim}
          demo={demo}
          remainingVes={bill.remainingVes ?? "0"}
          cardRef={form.successRef}
          onDeclareAgain={onDeclareAgain}
        />
      ) : form.sessionDead ? (
        <p className="text-sm text-muted-foreground">{form.error?.message}</p>
      ) : form.billClosed ? (
        <p className="text-sm text-muted-foreground">{form.error?.message}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.canSubmit) return;
            form.mutation.mutate();
          }}
          noValidate
        >
          <div>
            <label htmlFor="claim-amount" className="field-label">
              {t("claimAmountLabel")}
            </label>
            <input
              id="claim-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => {
                form.setAmountTouched(true);
                form.setAmount(e.target.value);
              }}
              aria-invalid={form.invalid("amount") || form.invalid("amountVes")}
              aria-describedby="claim-amount-help"
              className={field}
            />
            <p id="claim-amount-help" className="hint mt-1">
              {t("claimAmountHelp")}
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="claim-reference" className="field-label">
              {t("claimReferenceLabel")}
            </label>
            <input
              id="claim-reference"
              ref={form.referenceRef}
              inputMode="numeric"
              value={form.reference}
              onChange={(e) => form.setReference(e.target.value)}
              aria-invalid={form.invalid("reference")}
              aria-describedby="claim-reference-help"
              className={field}
            />
            <p id="claim-reference-help" className="hint mt-1">
              {t("claimReferenceHelp")}
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="claim-phone" className="field-label">
              {t("claimPhoneLabel")}
            </label>
            <input
              id="claim-phone"
              inputMode="numeric"
              value={form.phoneOrigin}
              onChange={(e) => form.setPhoneOrigin(e.target.value)}
              aria-invalid={form.invalid("phoneOrigin")}
              aria-describedby="claim-phone-help"
              className={field}
            />
            <p id="claim-phone-help" className="hint mt-1">
              {t("claimPhoneHelp")}
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="claim-bank" className="field-label">
              {t("claimBankLabel")}
            </label>
            {/*
              Desplegable y no caja de texto: el servidor valida contra una
              lista cerrada, así que cualquier cosa escrita a mano es un 400
              que impide pagar. Vacío es una opción de verdad -- es lo que
              hace que «opcional» signifique opcional.
            */}
            <select
              id="claim-bank"
              value={form.bankOrigin}
              onChange={(e) => form.setBankOrigin(e.target.value)}
              aria-invalid={form.invalid("bankOrigin")}
              disabled={form.banks.isPending || form.banks.isError}
              className={field}
            >
              <option value="">{t("claimBankNone")}</option>
              {(form.banks.data ?? []).map((bank: BankRef) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label htmlFor="claim-email" className="field-label">
              {t("payerEmailLabel")}
            </label>
            <input
              id="claim-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => form.setEmail(e.target.value)}
              placeholder="tu@correo.com"
              aria-describedby="claim-email-help"
              className={field}
            />
            {/* Lo que dice tiene que ser verdad. Prometía «el comprobante
                y, si la pides, tu factura», y el correo se guardaba como
                contacto sin llegar a ninguna de las dos. Ahora, donde se
                factura, sirve para la factura de abajo; donde no, sólo para
                lo que se marque. */}
            <p id="claim-email-help" className="hint mt-1">
              {form.canInvoice ? t("payerEmailWhyInvoice") : t("payerEmailWhyContact")}
            </p>
            {form.canInvoice && form.email.trim() && (
              <div className="mt-3 rounded-lg border border-border-strong p-3">
                <label className="flex items-start gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    data-testid="guest-claim-invoice"
                    checked={form.wantsInvoice}
                    onChange={(e) => form.setWantsInvoice(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{t("claimInvoiceAsk")}</span>
                </label>
                {form.wantsInvoice && (
                  <>
                    <p className="hint mt-1.5 pl-6.5">{t("claimInvoiceWhen")}</p>
                    <label className="hint mt-2 flex items-start gap-2 pl-6.5">
                      <input
                        type="checkbox"
                        checked={form.inName}
                        onChange={(e) => form.setInName(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span>{t("claimInvoiceInName")}</span>
                    </label>
                    {form.inName && (
                      <div className="mt-2 space-y-2 pl-6.5">
                        <input
                          aria-label={t("invoiceName")}
                          placeholder={t("invoiceName")}
                          value={form.invoiceName}
                          onChange={(e) => form.setInvoiceName(e.target.value)}
                          autoComplete="name"
                          aria-invalid={form.invalid("invoice.name")}
                          className={field}
                        />
                        <input
                          aria-label={t("invoiceTaxId")}
                          placeholder="V12345678 / J123456789"
                          value={form.invoiceTaxId}
                          onChange={(e) => form.setInvoiceTaxId(e.target.value)}
                          autoCapitalize="characters"
                          aria-invalid={form.invalid("invoice.taxId")}
                          className={field}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {/* Sólo cuando hay un correo que consentir. Una casilla de
                permiso sobre un campo vacío no consiente nada y sólo añade
                una decisión más a una pantalla donde se está pagando. */}
            {form.email.trim() && (
              <label className="hint mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={form.marketing}
                  onChange={(e) => form.setMarketing(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>{t("payerEmailMarketing")}</span>
              </label>
            )}
          </div>

          {form.error && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-foreground">
              <p>{form.error.message}</p>
              {form.error.suggestVes && (
                <button
                  type="button"
                  onClick={() => {
                    form.setAmount(formatMinor(form.error!.suggestVes!));
                    form.setError(null);
                  }}
                  className="btn-choice mt-2 min-h-10 px-4 text-sm"
                >
                  {t("claimUseAmount")}
                </button>
              )}
              {/* "Referencia: 078ba826-..." se leía como si la referencia
                  que acababa de escribir hubiera sido sustituida por eso.
                  Es el número con el que el personal puede buscar qué pasó,
                  y así lo dice ahora. */}
              {form.error.requestId && (
                <p className="hint mt-2">
                  {t("guestErrIncidentCode")}{" "}
                  <span className="font-mono">{form.error.requestId.slice(0, 8)}</span>
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            data-testid="guest-claim-submit"
            disabled={!form.canSubmit}
            className="btn-primary mt-5 w-full"
          >
            {form.mutation.isPending
              ? t("loading")
              : form.cooldown > 0
                ? t("guestWaitSeconds").replace("{n}", String(form.cooldown))
                : t("guestIPaid")}
          </button>
          <p className="hint mt-2">{t("guestClaimNote")}</p>
        </form>
      )}
    </div>
  );
}
