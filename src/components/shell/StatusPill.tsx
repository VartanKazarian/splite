/**
 * Un estado, en una píldora.
 *
 * Los tonos significan una cosa cada uno y no se usan por adorno: verde
 * sano, ámbar hay que mirarlo, ámbar relleno hay dinero de alguien esperando
 * a que lo miren, rojo va mal, gris ni una cosa ni otra.
 * El texto va siempre -- el color no puede ser lo único que lo diga.
 */
export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "good" | "attention" | "urgent" | "bad";
}) {
  const styles = {
    neutral: "bg-secondary font-normal text-muted-foreground",
    good: "bg-primary/15 font-normal text-primary",
    attention: "bg-amber-500/15 font-normal text-amber-800",
    urgent: "bg-amber-400 font-medium text-amber-950",
    bad: "bg-destructive/10 font-normal text-destructive",
  }[tone];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-tight tracking-normal ${styles}`}
    >
      {children}
    </span>
  );
}
