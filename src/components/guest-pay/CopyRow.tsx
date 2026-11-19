import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import "@/lib/i18n-guest";

export function CopyRow({
  label,
  display,
  copyValue,
  lead,
}: {
  label: string;
  display: string;
  copyValue: string;
  /** El importe: una fila por tarjeta se lleva la cifra grande. */
  lead?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const { t } = useI18n();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={`flex gap-3 border-b border-border py-2.5 last:border-b-0 ${
        lead ? "flex-col" : "items-center justify-between"
      }`}
    >
      <span className="eyebrow">{label}</span>
      <span className={`flex items-center gap-2 ${lead ? "justify-between" : ""}`}>
        {/* El monto es lo que se teclea en el banco, y medía 14 px como el
            código de la sucursal. Sube a la escala grande y se lleva la fila
            entera; los otros tres datos se quedan como estaban. */}
        <span className={lead ? "money-xl" : "money-md"}>{display}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={t("copyField").replace("{label}", label)}
          // 44 px. Copiar el banco, el teléfono y el RIF es literalmente el
          // trámite del Pago Móvil: se hace tres veces seguidas, de pie y con
          // el banco abierto al lado. Fallar el toque cuesta volver a empezar.
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg border-[1.5px] border-border-strong bg-card px-2 text-xs text-foreground transition-colors hover:bg-secondary"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied && <span>{t("copied")}</span>}
        </button>
      </span>
    </div>
  );
}
