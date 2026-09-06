import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { account, menu, tables as tablesApi } from "@/lib/api";

/**
 * Lo que le falta al restaurante para poder trabajar.
 *
 * No es una lista de tareas decorativa: cada punto es una pared contra la que
 * se choca un comensal, no el restaurante. Sin datos de cobro,
 * `dto.guestPayee` devuelve null y quien elige Pago Móvil en la mesa no ve a
 * dónde mandar el dinero -- y hasta que esto existió, nada en el panel lo
 * decía. Se podían imprimir los QR, sentar clientes y descubrirlo en la mesa.
 *
 * **Por qué encoge.** Antes era una tarjeta con tres filas, cada una con su
 * título y su explicación: media pantalla de móvil ocupada por una lista que
 * se lee una vez y se termina en la primera semana. Ahora son tres segmentos y
 * una fila; lo único que conserva tamaño es el paso que queda por hacer, que
 * es el que tiene un botón. Terminada, la tarjeta desaparece sola: una lista
 * que sigue ahí después de completarse deja de leerse, y la siguiente que
 * aparezca tampoco se leerá.
 *
 * Los tres estados salen de datos reales -- mesas del plano, productos o PDF de
 * la carta, y `payout` de la cuenta -- y ninguno está escrito a mano aquí.
 */
export function ConfigurationCard() {
  const { t } = useI18n();

  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => account.get(),
    retry: false,
  });
  const floorQuery = useQuery({
    queryKey: ["floor"],
    queryFn: () => tablesApi.floor(),
    retry: false,
  });

  const restaurantId = accountQuery.data?.id;
  // La misma clave que usa la portada en Configuración y la carta pública: una
  // consulta, no tres.
  const menuQuery = useQuery({
    queryKey: ["public-menu", restaurantId],
    enabled: Boolean(restaurantId),
    retry: false,
    queryFn: () => menu.publicMenu(restaurantId!),
  });

  // Mientras no se sepa, no se dice nada. Un aviso de "te falta la carta"
  // mientras la carta se está cargando es peor que no avisar.
  if (!accountQuery.data || !floorQuery.data || !menuQuery.data) return null;

  const steps = [
    {
      key: "tables",
      done: floorQuery.data.length > 0,
      label: t("setupTables"),
      why: t("setupTablesWhy"),
      to: "/dashboard" as const,
    },
    {
      key: "menu",
      done: (menuQuery.data.products?.length ?? 0) > 0 || Boolean(menuQuery.data.menuPdf),
      label: t("setupMenu"),
      why: t("setupMenuWhy"),
      to: "/menu" as const,
    },
    {
      key: "payout",
      // El único que no se nota hasta que un cliente ya está sentado.
      done: Boolean(accountQuery.data.payout),
      label: t("setupPayout"),
      why: t("setupPayoutWhy"),
      to: "/settings" as const,
    },
  ];

  const done = steps.filter((s) => s.done).length;
  // Terminada no ocupa nada. Ver el comentario de arriba.
  if (done === steps.length) return null;

  // El siguiente paso pendiente, que es el que se lleva el botón. Un botón por
  // fila convierte la tarjeta en tres llamadas a la acción compitiendo entre
  // ellas; sólo hay un "siguiente".
  const next = steps.find((s) => !s.done)!;

  return (
    <section className="surface p-4" aria-labelledby="setup-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="setup-heading" className="text-sm font-medium">
          {t("setupTitle")}
        </h2>
        <span className="money-sm text-muted-foreground">
          {done}/{steps.length}
        </span>
      </div>

      {/* Tres segmentos, uno por paso. `aria-hidden` porque la lista de debajo
          ya dice lo mismo con palabras: el color no puede ser lo único que
          comunique el estado. */}
      <div aria-hidden className="mt-2 flex gap-1">
        {steps.map((s) => (
          <span
            key={s.key}
            className={`h-1 flex-1 rounded-full ${s.done ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {steps.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            {s.done ? (
              <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <span
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/50"
              />
            )}
            <span className={s.done ? "text-muted-foreground" : "font-medium"}>{s.label}</span>
          </li>
        ))}
      </ul>

      {/* Por qué importa, no qué hay que pulsar. "Faltan las mesas" no dice
          nada; "sin mesas no hay códigos que poner" sí. */}
      <p className="mt-3 text-xs text-muted-foreground">{next.why}</p>

      <Link
        to={next.to}
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("setupConfigure")}
      </Link>
    </section>
  );
}
