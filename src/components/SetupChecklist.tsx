import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { account, menu, tables as tablesApi } from "@/lib/api";

/**
 * Lo que le falta al restaurante para poder trabajar.
 *
 * No es una lista de tareas decorativa: cada punto es una pared contra la que
 * se choca un comensal, no el restaurante. Sin datos de cobro,
 * `dto.guestPayee` devuelve null y quien elige Pago Móvil en la mesa no ve a
 * dónde mandar el dinero -- y hasta ahora nada en el panel lo decía. Se podían
 * imprimir los QR, sentar clientes y descubrirlo en la mesa.
 *
 * Desaparece sola cuando está todo. Una lista que sigue ahí después de
 * terminada deja de leerse, y la siguiente que aparezca tampoco se leerá.
 */
export function SetupChecklist() {
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

  const missing = steps.filter((step) => !step.done);
  if (missing.length === 0) return null;

  return (
    <section className="surface mt-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg">{t("setupTitle")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("setupProgress")
            .replace("{done}", String(steps.length - missing.length))
            .replace("{total}", String(steps.length))}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              to={step.to}
              className={`flex items-start gap-3 rounded-lg px-2 py-2 transition-colors ${
                step.done ? "" : "hover:bg-secondary"
              }`}
            >
              {step.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span
                  className={`block text-sm ${step.done ? "text-muted-foreground line-through" : ""}`}
                >
                  {step.label}
                </span>
                {/* Por qué importa, no qué hay que pulsar. "Faltan las mesas" no
                    dice nada; "sin mesas no hay códigos que poner" sí. */}
                {!step.done && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{step.why}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
