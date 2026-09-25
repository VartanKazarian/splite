import type { AdminCharge } from "@/lib/adminApi";

export function ChargeStatus({ ch }: { ch: Pick<AdminCharge, "status" | "overdue"> }) {
  const [label, tone] =
    ch.status === "PAID"
      ? ["Pagado", "border-primary/40 bg-primary/10 text-primary"]
      : ch.status === "VOID"
        ? ["Anulado", "border-border text-muted-foreground line-through"]
        : ch.overdue
          ? ["Vencido", "border-destructive/40 bg-destructive/10 text-destructive"]
          : ["Pendiente", "border-amber-500/50 bg-amber-500/10 text-amber-800"];
  return (
    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] ${tone}`}>
      {label}
    </span>
  );
}
