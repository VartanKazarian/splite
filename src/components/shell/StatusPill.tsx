/**
 * Un estado, en una píldora.
 *
 * Los cuatro tonos significan una cosa cada uno y no se usan por adorno:
 * verde sano, ámbar hay que mirarlo, rojo va mal, gris ni una cosa ni otra.
 * El texto va siempre -- el color no puede ser lo único que lo diga.
 */
export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "good" | "attention" | "bad";
}) {
  const styles = {
    neutral: "bg-secondary text-muted-foreground",
    good: "bg-primary/15 text-primary",
    attention: "bg-amber-500/15 text-amber-700",
    bad: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-normal leading-tight tracking-normal ${styles}`}
    >
      {children}
    </span>
  );
}
