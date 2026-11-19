import { useI18n } from "@/lib/i18n";

/**
 * ES / EN. Con el nombre de cada idioma en su propio idioma para el lector de
 * pantalla: quien no entiende la página tampoco entendería «Inglés».
 */
const NAMES = { es: "Español", en: "English" } as const;

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className="inline-flex items-center rounded-full border border-border bg-secondary p-0.5 text-xs"
    >
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-label={NAMES[l]}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-8 rounded-full px-3 py-1 uppercase tracking-widest transition-colors ${
            lang === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
