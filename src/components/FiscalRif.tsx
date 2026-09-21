import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { ApiError, account } from "@/lib/api";

/**
 * El RIF con el que este restaurante declara.
 *
 * Hasta aquí sólo se podía escribir en el alta por autoservicio: `GET /account`
 * lo devolvía y no había forma de ponerlo ni de corregirlo, así que un local
 * dado de alta por cualquier otro camino se quedaba sin él -- y sin RIF no se
 * emite ninguna factura. La única salida era entrar a la base a mano.
 *
 * Tres cosas la separan de un campo de perfil, y las tres se ven aquí:
 *
 * **El dígito verificador avisa, no bloquea.** El servidor guarda un RIF bien
 * formado aunque el dígito no cuadre, y contesta `checksumOk: false`. Esta
 * pantalla es quien tiene que decirlo en voz alta: callarlo dejaría salir un
 * número que se imprime en cada factura y no sirve para desgravar, y rechazarlo
 * dejaría sin facturar a un restaurante real por un cálculo nuestro que nunca
 * se contrastó contra un corpus.
 *
 * **Se congela al emitir.** No se adivina aquí: no hay dato en la cuenta que
 * diga si ya salió un documento, y el que más se le parece -- que la serie haya
 * numerado -- sólo vale emitiendo por medios propios. Así que se intenta y, si
 * el servidor contesta 409, la pantalla pasa a explicar bajo qué RIF se emitió
 * en vez de seguir ofreciendo un campo que no va a aceptar nada.
 *
 * **Un RIF repetido no es un error del formulario**: casi siempre significa que
 * ese contribuyente ya tiene cuenta, y eso hay que decirlo con esas palabras.
 */
/**
 * `J123456784` -> `J-12345678-4`, sólo para leerlo.
 *
 * Presentación y nada más: quien normaliza para guardar y para comparar es el
 * servidor, y esta función no decide nada -- lo que no encaje sale tal cual en
 * vez de inventarse una forma. Sin ella el campo cambiaba de aspecto al
 * guardar, porque la respuesta viene con guiones y la cuenta lo devuelve sin
 * ellos.
 */
function forDisplay(rif: string): string {
  const m = /^([VEJPG])(\d{8})(\d)$/.exec(rif.toUpperCase());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : rif;
}

export function FiscalRif({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ["account"], queryFn: () => account.get(), retry: false });
  const saved = query.data?.rif ?? null;

  const [rif, setRif] = useState("");
  const [bad, setBad] = useState(false);
  // Qué contestó el servidor lo último: el aviso del dígito, o bajo qué RIF ya
  // se emitió. Nulo mientras no haya contestado nada.
  const [warnChecksum, setWarnChecksum] = useState(false);
  const [lockedUnder, setLockedUnder] = useState<string | null>(null);

  // El servidor manda mientras no se esté escribiendo.
  useEffect(() => {
    if (saved) setRif(forDisplay(saved));
  }, [saved]);

  const save = useMutation({
    mutationFn: () => account.setRif(rif.trim()),
    onMutate: () => {
      setBad(false);
      setWarnChecksum(false);
    },
    onSuccess: (data) => {
      setRif(data.rif);
      setWarnChecksum(!data.checksumOk);
      void queryClient.invalidateQueries({ queryKey: ["account"] });
      // Dos resultados distintos y no uno: guardado y correcto no es lo mismo
      // que guardado con el dígito sin cuadrar, y el segundo hay que mirarlo.
      if (data.checksumOk) toast.success(t("fiscalRifSaved"));
      else toast.warning(t("fiscalRifChecksumWarn"));
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.code === "FISCAL_RIF_MALFORMED") {
        setBad(true);
        toast.error(t("fiscalRifMalformed"));
        return;
      }
      if (error instanceof ApiError && error.code === "FISCAL_RIF_LOCKED") {
        const issued = error.details?.["issuedRif"];
        setLockedUnder(typeof issued === "string" ? issued : (saved ?? ""));
        toast.error(t("fiscalRifLocked"));
        return;
      }
      if (error instanceof ApiError && error.code === "FISCAL_RIF_TAKEN") {
        setBad(true);
        toast.error(t("fiscalRifTaken"));
        return;
      }
      if (error instanceof ApiError) toast.error(`${error.code} · ${error.message}`);
      else toast.error(t("apiDown"));
    },
  });

  // Se compara normalizado: «J-12345678-4» y «J123456784» son el mismo RIF,
  // y ofrecer «Guardar» por haber quitado un guion sería ofrecer un no-cambio.
  const bare = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const unchanged = bare(rif) === "" || bare(rif) === bare(saved ?? "");

  return (
    <section className="surface mt-4 p-6">
      <h2 className="text-lg">{t("fiscalRifTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("fiscalRifWhy")}</p>

      {lockedUnder !== null ? (
        <div
          data-testid="fiscal-rif-locked"
          className="mt-5 rounded-lg border border-border bg-secondary p-4"
        >
          <p className="text-sm">{t("fiscalRifLockedBody")}</p>
          <p className="figure mt-2 text-base">{lockedUnder}</p>
        </div>
      ) : (
        <>
          <label className="mt-5 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("fiscalRifLabel")}</span>
            <input
              data-testid="fiscal-rif-input"
              value={rif}
              disabled={!canEdit || query.isLoading}
              onChange={(e) => {
                setRif(e.target.value);
                setBad(false);
                setWarnChecksum(false);
              }}
              placeholder="J-12345678-4"
              maxLength={20}
              autoComplete="off"
              aria-invalid={bad}
              className={`min-h-11 w-full rounded-lg border bg-secondary px-4 py-3 text-sm outline-none focus:border-ring disabled:opacity-50 ${
                bad ? "border-destructive" : "border-input"
              }`}
            />
          </label>

          {/* El aviso vive junto al campo y sobrevive al toast: un aviso que se
              va solo a los cinco segundos no sirve para algo que hay que ir a
              comprobar contra un papel. */}
          {warnChecksum && (
            <p className="mt-2 text-xs text-destructive">{t("fiscalRifChecksumWarn")}</p>
          )}

          {canEdit && (
            <button
              type="button"
              data-testid="fiscal-rif-save"
              onClick={() => save.mutate()}
              disabled={unchanged || save.isPending}
              className="mt-4 min-h-11 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {save.isPending ? t("loading") : t("fiscalRifSave")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
