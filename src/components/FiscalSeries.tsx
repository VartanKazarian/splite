import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, account, type FiscalSeries as Series } from "@/lib/api";

/**
 * La serie fiscal autorizada.
 *
 * Emitiendo por medios propios, el número lo pone el local -- así que estos
 * seis campos son lo que decide qué sale impreso en cada factura. No es una
 * preferencia: es la transcripción de una autorización del SENIAT, y lo único
 * honesto que puede hacer esta pantalla es decirlo y enseñar el resultado antes
 * de que se emita con él.
 *
 * De ahí las dos cosas que la separan de un formulario cualquiera: la vista
 * previa del próximo número, que es como se comprueba el prefijo y el ancho
 * contra el papel; y el candado, que después de la primera factura deja de
 * dejar cambiar el formato porque cambiarlo contradiría lo ya emitido.
 *
 * Sólo el dueño escribe. El resto la ve: el personal puede necesitar saber por
 * qué número va sin poder tocarlo.
 */
export function FiscalSeries({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["fiscal-series"],
    queryFn: () => account.fiscalSeries(),
    retry: false,
  });

  const [form, setForm] = useState({
    controlPrefix: "",
    documentPrefix: "",
    padTo: "8",
    controlFirst: "1",
    controlLast: "",
    authorisationRef: "",
  });
  // Qué campos señaló el servidor al rechazar. Se limpian al volver a mandar:
  // un campo en rojo por un error ya resuelto miente igual que no marcarlo.
  const [rejected, setRejected] = useState<string[]>([]);

  const saved = query.data ?? null;

  // El servidor manda mientras no se esté escribiendo.
  useEffect(() => {
    if (!saved) return;
    setForm({
      controlPrefix: saved.controlPrefix,
      documentPrefix: saved.documentPrefix,
      padTo: String(saved.padTo),
      controlFirst: saved.controlFirst,
      controlLast: saved.controlLast ?? "",
      authorisationRef: saved.authorisationRef ?? "",
    });
  }, [saved]);

  const save = useMutation({
    mutationFn: () =>
      account.setFiscalSeries({
        controlPrefix: form.controlPrefix.trim(),
        documentPrefix: form.documentPrefix.trim(),
        padTo: Number(form.padTo),
        controlFirst: Number(form.controlFirst),
        // Vacío es «sin tope», que es un valor y no un campo sin rellenar.
        controlLast: form.controlLast.trim() === "" ? null : Number(form.controlLast),
        authorisationRef: form.authorisationRef.trim(),
      }),
    onMutate: () => setRejected([]),
    onSuccess: (data: Series) => {
      queryClient.setQueryData(["fiscal-series"], data);
      toast.success(t("fiscalSeriesSaved"));
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.code === "FISCAL_SERIES_LOCKED") {
        const fields = error.details?.["fields"];
        setRejected(Array.isArray(fields) ? fields.map(String) : []);
        toast.error(t("fiscalSeriesLockedError"));
        return;
      }
      if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
      else toast.error(t("apiDown"));
    },
  });

  // Los cuatro que se congelan tras la primera factura. El servidor los rechaza
  // igualmente; deshabilitarlos es para no ofrecer un botón que contesta 409.
  const locked = saved?.locked === true;
  const frozen = (field: string) =>
    !canEdit ||
    (locked && ["controlPrefix", "documentPrefix", "padTo", "controlFirst"].includes(field));

  const pad = Math.min(Math.max(Number(form.padTo) || 1, 1), 20);
  const first = form.controlFirst.replace(/\D/g, "") || "0";
  // La vista previa se calcula aquí y no se espera al servidor: sirve para
  // comprobar el formato **antes** de guardar, que es cuando todavía se puede
  // corregir sin una nota de crédito de por medio.
  const preview = saved?.nextControlNumber ?? `${form.controlPrefix}${first.padStart(pad, "0")}`;

  const field = (
    key: keyof typeof form,
    label: string,
    extra: {
      placeholder?: string;
      inputMode?: "numeric";
      maxLength?: number;
      // La aclaración va pegada a su campo. Agrupadas al final de la sección,
      // una nota sobre el ancho leída debajo de la referencia de la
      // autorización no aclara nada: hay que adivinar a cuál se refiere.
      hint?: string;
    } = {},
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={form[key]}
        disabled={frozen(key) || query.isLoading}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={extra.placeholder}
        inputMode={extra.inputMode}
        maxLength={extra.maxLength}
        className={`min-h-11 w-full rounded-lg border bg-secondary px-4 py-3 text-sm outline-none focus:border-ring disabled:opacity-50 ${
          rejected.includes(key) ? "border-destructive" : "border-input"
        }`}
      />
      {extra.hint && <span className="text-xs text-muted-foreground">{extra.hint}</span>}
    </label>
  );

  return (
    <section className="surface mt-4 p-6">
      <h2 className="text-xl">{t("fiscalSeries")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("fiscalSeriesHint")}</p>

      {!query.isLoading && saved === null && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {t("fiscalSeriesUnset")}
        </p>
      )}

      {locked && (
        <p className="mt-3 text-xs text-muted-foreground">{t("fiscalSeriesLockedNote")}</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {field("controlPrefix", t("fiscalSeriesControlPrefix"), {
          placeholder: "00-",
          maxLength: 20,
        })}
        {field("documentPrefix", t("fiscalSeriesDocumentPrefix"), {
          placeholder: "F-",
          maxLength: 20,
        })}
        {field("padTo", t("fiscalSeriesPadTo"), {
          inputMode: "numeric",
          maxLength: 2,
          hint: t("fiscalSeriesPadToHint"),
        })}
        {field("controlFirst", t("fiscalSeriesFirst"), { inputMode: "numeric", maxLength: 18 })}
        {field("controlLast", t("fiscalSeriesLast"), {
          inputMode: "numeric",
          maxLength: 18,
          hint: t("fiscalSeriesLastHint"),
        })}
        {field("authorisationRef", t("fiscalSeriesRef"), { maxLength: 120 })}
      </div>

      {/* Lo que va a salir impreso. Enseñarlo es lo que convierte seis campos
          sueltos en algo que se puede cotejar con la autorización de un vistazo. */}
      <p className="mt-3 text-sm">{t("fiscalSeriesNext").replace("{number}", preview)}</p>

      <button
        disabled={!canEdit || save.isPending || query.isLoading}
        onClick={() => save.mutate()}
        className="mt-4 min-h-11 self-start whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
      >
        {t("save")}
      </button>

      {!canEdit && (
        <p className="mt-2 text-xs text-muted-foreground">{t("fiscalSeriesOwnerOnly")}</p>
      )}
    </section>
  );
}
