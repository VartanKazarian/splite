import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Landmark, Webhook, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { ApiError, API_BASE_URL, bankConnections, type BankConnection } from "@/lib/api";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/dates";

/**
 * De dónde le llegan a Splite los movimientos de la cuenta del restaurante.
 *
 * Dos fuentes, y las dos sirven para cualquier banco:
 *   - el estado de cuenta que se descarga del banco y se sube desde Pagos;
 *   - un webhook firmado, para un servicio de verificación o un script.
 *
 * Todo lo que cambia la confianza -- crear, quitar, rotar la firma, dejar que
 * un movimiento confirme solo -- es del dueño; el encargado ve el estado. El
 * servidor lo decide; aquí sólo se esconden los botones que va a rechazar.
 */
export function BankConnections({ canEdit }: { canEdit: boolean }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);

  const list = useQuery({ queryKey: ["bank-connections"], queryFn: () => bankConnections.list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["bank-connections"] });
  const fail = (e: unknown) =>
    toast.error(e instanceof ApiError ? `${e.code} · ${e.message}` : t("apiUnreachable"));

  const create = useMutation({
    mutationFn: (kind: BankConnection["kind"]) =>
      bankConnections.create({
        kind,
        label: kind === "WEBHOOK" ? t("bankWebhookDefaultLabel") : t("bankStatementDefaultLabel"),
      }),
    onSuccess: (res) => {
      if (res.secret && res.path)
        setSecret({ url: `${API_BASE_URL}${res.path}`, secret: res.secret });
      toast.success(t("bankConnectionCreated"));
      void refresh();
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: (p: { id: string; body: { autoConfirm?: boolean; active?: boolean } }) =>
      bankConnections.update(p.id, p.body),
    onSuccess: () => {
      toast.success(t("staffSaved"));
      void refresh();
      void qc.invalidateQueries({ queryKey: ["payment-claims"] });
    },
    onError: fail,
  });

  const rotate = useMutation({
    mutationFn: (id: string) => bankConnections.rotateSecret(id),
    onSuccess: (res) => {
      setSecret({ url: `${API_BASE_URL}${res.path}`, secret: res.secret });
      void refresh();
    },
    onError: fail,
  });

  const copy = (value: string) =>
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast.success(t("staffInviteCopied")))
      .catch(() => toast.error(t("staffInviteCopyFailed")));

  const rows = list.data ?? [];
  const busy = create.isPending || update.isPending || rotate.isPending;

  return (
    <section className="surface mt-6 p-6" data-testid="bank-connections">
      <h2 className="inline-flex items-center gap-2 text-xl">
        <Landmark className="h-5 w-5 text-muted-foreground" /> {t("bankTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("bankIntro")}</p>

      {list.isLoading && <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>}
      {list.isSuccess && rows.length === 0 && (
        <p className="mt-4 rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {t("bankNone")}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {rows.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-border p-4"
            data-testid={`bank-connection-${c.kind}`}
          >
            <div className="flex items-start gap-3">
              {c.kind === "WEBHOOK" ? (
                <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">
                  {c.kind === "WEBHOOK" ? t("bankWebhookWhat") : t("bankStatementWhat")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.lastMovementAt
                    ? t("bankLastMovement").replace(
                        "{when}",
                        formatDateTime(c.lastMovementAt, lang) ?? "",
                      )
                    : t("bankNoMovementsYet")}
                </p>
                {c.lastError && <p className="mt-1 text-xs text-amber-800">{c.lastError}</p>}
              </div>
            </div>

            {/* Dejar que un movimiento confirme solo es decidir que esta fuente
                vale lo que la mirada de una persona. Pregunta antes, como el
                resto de lo que no se deshace de un vistazo; volver a sólo
                sugerir no pregunta. */}
            <div className="mt-3 rounded-lg bg-secondary p-3" data-testid="bank-auto-confirm">
              <p className="text-sm font-medium">
                {c.autoConfirm ? t("bankAutoConfirmIsOn") : t("bankAutoConfirmIsOff")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.autoConfirm ? t("bankAutoConfirmOn") : t("bankAutoConfirmOff")}
              </p>
              {canEdit &&
                (c.autoConfirm ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => update.mutate({ id: c.id, body: { autoConfirm: false } })}
                    className="mt-2 inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs disabled:opacity-40"
                  >
                    {t("bankAutoConfirmDisable")}
                  </button>
                ) : (
                  <ConfirmButton
                    title={t("bankAutoConfirmTitle")}
                    description={t("bankAutoConfirmBody")}
                    confirmLabel={t("bankAutoConfirmEnable")}
                    onConfirm={() => update.mutate({ id: c.id, body: { autoConfirm: true } })}
                    disabled={busy}
                    data-testid="bank-auto-confirm-enable"
                    className="mt-2 inline-flex min-h-11 items-center rounded-full border border-border-strong px-3 text-xs disabled:opacity-40"
                  >
                    {t("bankAutoConfirmEnable")}
                  </ConfirmButton>
                ))}
            </div>

            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.kind === "WEBHOOK" && (
                  <ConfirmButton
                    title={t("bankRotateTitle")}
                    description={t("bankRotateBody")}
                    confirmLabel={t("bankRotate")}
                    onConfirm={() => rotate.mutate(c.id)}
                    disabled={busy}
                    className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs disabled:opacity-40"
                  >
                    {t("bankRotate")}
                  </ConfirmButton>
                )}
                <ConfirmButton
                  title={t("bankRemoveTitle")}
                  description={t("bankRemoveBody")}
                  confirmLabel={t("bankRemove")}
                  onConfirm={() => update.mutate({ id: c.id, body: { active: false } })}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center rounded-full border border-destructive/60 px-3 text-xs text-destructive disabled:opacity-40"
                >
                  {t("bankRemove")}
                </ConfirmButton>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* La firma, una sola vez. Nadie la guarda: si se pierde, se rota. */}
      {secret && (
        <div
          className="mt-4 grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4"
          role="status"
          data-testid="bank-webhook-secret"
        >
          <p className="text-sm font-medium">{t("bankSecretTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("bankSecretHint")}</p>
          {(
            [
              [t("bankSecretUrl"), secret.url],
              [t("bankSecretKey"), secret.secret],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="grid gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={value}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={label}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => copy(value)}
                  aria-label={`${t("staffInviteCopy")}: ${label}`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border px-3"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">{t("bankSecretOnce")}</p>
          <button
            type="button"
            onClick={() => setSecret(null)}
            className="justify-self-start text-xs text-muted-foreground underline underline-offset-2"
          >
            {t("staffInviteDone")}
          </button>
        </div>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!rows.some((c) => c.kind === "STATEMENT_IMPORT") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => create.mutate("STATEMENT_IMPORT")}
              data-testid="bank-add-statement"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              <FileSpreadsheet className="h-4 w-4" /> {t("bankAddStatement")}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => create.mutate("WEBHOOK")}
            data-testid="bank-add-webhook"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong px-4 text-sm disabled:opacity-40"
          >
            <Webhook className="h-4 w-4" /> {t("bankAddWebhook")}
          </button>
        </div>
      )}
    </section>
  );
}
