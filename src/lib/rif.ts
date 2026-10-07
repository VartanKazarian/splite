/**
 * El RIF del comercio, como lo escriba el dueño.
 *
 * «J-30724328-7», «j307243287» y «J000000307243287» son el mismo: el servidor
 * guarda la letra y los dígitos sin ceros a la izquierda, y aquí se hace lo
 * mismo para avisar antes de enviar un RIF que va a rechazar.
 */
export function normaliseRif(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^VEJGPC0-9]/g, "");
  const m = /^([VEJGPC])0*(\d{5,15})$/.exec(s);
  return m ? `${m[1]}${m[2]}` : null;
}

/** «J307243287» → «J-30724328-7», como aparece en los documentos. */
export function formatRif(rif: string | null | undefined): string {
  if (!rif) return "";
  const m = /^([VEJGPC])(\d+)(\d)$/.exec(rif);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : rif;
}
