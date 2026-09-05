import { useQuery } from "@tanstack/react-query";

import { account } from "./api";

/**
 * Si el Pago Móvil de una mesa puede llegar a alguna parte.
 *
 * Se consulta donde se enseña el QR, porque es ahí donde alguien está a punto
 * de imprimir un código y ponerlo en una mesa.
 *
 * Vive fuera de `ConfigurationCard` a propósito: un archivo que exporta un
 * componente y además otra cosa rompe el fast refresh del componente.
 *
 * Devuelve `null` mientras no se sepa. Quien lo use tiene que distinguir "no
 * hay datos de cobro" de "todavía no ha contestado el servidor": avisar de lo
 * primero cuando es lo segundo es un susto gratis cada vez que se carga.
 */
export function usePayoutConfigured(): boolean | null {
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });
  if (!accountQuery.data) return null;
  return Boolean(accountQuery.data.payout);
}
