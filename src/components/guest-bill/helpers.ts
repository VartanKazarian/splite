import { applyRate, parseRate } from "@/lib/fiscal";
import {
  parseMinorInput,
  type Bill,
  type SplitMode,
  type SplitPreview,
  type SplitPreviewRequest,
} from "@/lib/api";

/** Referencia visual en Bs de un importe cotizado, a la tasa congelada de la cuenta. */
export function toVes(minor: string, rate: string | null): string {
  if (!rate) return "0";
  try {
    return applyRate(BigInt(minor), parseRate(rate)).toString();
  } catch {
    return "0";
  }
}

/**
 * Bajar el marco de la demo, y sólo el marco.
 *
 * A mano y no con `scrollIntoView`, que además del contenedor arrastra la
 * página: una landing que se desplaza sola mientras alguien está leyendo otra
 * cosa es peor que una demo que no se mueve.
 */
export function scrollBoxOf(el: HTMLElement | null): HTMLElement | null {
  let box: HTMLElement | null = el?.parentElement ?? null;
  while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
  return box;
}

export function scrollFrameTo(el: HTMLElement | null) {
  const box = scrollBoxOf(el);
  if (!el || !box) return;
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12;
  box.scrollTo({ top, behavior: "smooth" });
}

/** Lo que le toca a este comensal según el modo elegido. */
export function myShare(preview: SplitPreview, mode: SplitMode): string {
  if (mode === "EQUAL") return preview.allocations[0]?.amountVes ?? "0";
  const mineAlloc = preview.allocations.find((a) => a.participantId === "me");
  return mineAlloc?.amountVes ?? preview.allocations[0]?.amountVes ?? "0";
}

/**
 * El cuerpo del reparto: idéntico para la previsualización y para acordarlo.
 *
 * `mine` es itemId -> unidades que paga este comensal; `amount`, lo tecleado
 * en «Un monto».
 */
export function buildSplitBody({
  bill,
  mode,
  diners,
  myName,
  mine,
  amount,
}: {
  bill: Bill | null;
  mode: SplitMode;
  diners: number;
  myName: string;
  mine: Record<string, number>;
  amount: string;
}): SplitPreviewRequest {
  const remaining = BigInt(bill?.remainingVes ?? bill?.totalDueVes ?? "0");
  const me = { id: "me", ...(myName.trim() ? { name: myName.trim() } : {}) };
  if (mode === "FULL") return { mode, participants: [me] };
  if (mode === "EQUAL") {
    return {
      mode,
      // A partes iguales, sólo se conoce el nombre de quien está mirando:
      // los demás siguen siendo «Comensal N» hasta que cada uno escanee.
      participants: Array.from({ length: Math.max(2, diners) }, (_, i) =>
        i === 0 ? { ...me, id: "p1" } : { id: `p${i + 1}` },
      ),
    };
  }
  if (mode === "ITEMS") {
    return {
      mode,
      participants: [me, { id: "others" }],
      claims: (bill?.items ?? []).flatMap((item) => {
        const qty = mine[item.id] ?? 0;
        const rest = Math.max(0, (item.quantity ?? 1) - qty);
        return [
          ...(qty > 0 ? [{ itemId: item.id, quantity: qty, participantIds: ["me"] }] : []),
          ...(rest > 0 ? [{ itemId: item.id, quantity: rest, participantIds: ["others"] }] : []),
        ];
      }),
    };
  }
  const cents = BigInt(parseMinorInput(amount) || "0");
  const rest = remaining > cents ? remaining - cents : 0n;
  return {
    mode,
    participants: [
      { ...me, amountVes: cents.toString() },
      { id: "others", amountVes: rest.toString() },
    ],
  };
}
