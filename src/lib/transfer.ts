/**
 * Cómo se reparte una transferencia entre la cuenta y la propina.
 *
 * El comensal manda una sola transferencia y escribe aquí cuánto mandó. Antes,
 * si ese importe no superaba la propina elegida, se declaraba el importe
 * entero como cuenta *y además* la propina entera: avisaba de más de lo que
 * había transferido, y quien verificaba buscaba en el banco una cifra que no
 * existía. Y una transferencia corta se comía la cuenta antes que la propina.
 *
 * La regla, en orden: primero la cuenta (lo que se debe), hasta su parte;
 * después la propina, hasta lo elegido; lo que sobre por encima de las dos
 * va a la cuenta, para que el servidor lo rechace con su mensaje («máximo
 * X Bs») en vez de convertirlo en propina sin que nadie lo haya pedido.
 *
 * Siempre: amountVes + tipVes === transferredVes.
 */
export function apportionTransfer({
  transferredVes,
  tipVes,
  shareVes,
}: {
  transferredVes: string;
  tipVes: string;
  shareVes: string;
}): { amountVes: string; tipVes: string } {
  const sent = BigInt(transferredVes || "0");
  const chosenTip = BigInt(tipVes || "0");
  const share = BigInt(shareVes || "0");
  if (sent <= 0n) return { amountVes: "0", tipVes: "0" };

  const toBill = sent < share ? sent : share;
  const rest = sent - toBill;
  const toTip = rest < chosenTip ? rest : chosenTip;
  return { amountVes: (sent - toTip).toString(), tipVes: toTip.toString() };
}
