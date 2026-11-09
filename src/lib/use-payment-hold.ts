import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, guest, type Money } from "@/lib/api";

/**
 * La reserva de pago de este comensal: «Voy a pagar esto».
 *
 * Al abrir el pago se aparta lo que el comensal va a transferir, antes de que
 * copie los datos y vaya a su banco. Un Pago Móvil no pasa por Splite, así que
 * este es el único momento en que se puede evitar que otro de la mesa pague lo
 * mismo: después, la transferencia ya está hecha.
 *
 * Estados:
 * - `off`: nada que reservar (demo, cuenta pagada, importe cero).
 * - `placing`: pidiéndola.
 * - `held`: reservada hasta `expiresAt`. `amountVes` puede ser menor que lo
 *   pedido si otro había reservado parte (se toma lo que quedaba libre).
 * - `blocked`: otro de la mesa está pagando todo lo que queda.
 * - `expired`: venció sin avisar. Se vuelve a pedir al volver a la pantalla.
 * - `unavailable`: no se pudo pedir (red, servidor anterior). No bloquea nada:
 *   el comensal paga como antes de que existieran las reservas.
 *
 * Al salir del paso se suelta. Si el comensal avisa, el servidor la convierte
 * en su aviso; soltarla después no hace nada.
 */
export type HoldState =
  | { kind: "off" }
  | { kind: "placing" }
  | { kind: "held"; amountVes: Money; expiresAt: string; trimmed: boolean }
  | {
      kind: "blocked";
      heldVes: Money;
      pendingVes: Money;
      heldUntil: string | null;
    }
  | { kind: "expired" }
  | { kind: "unavailable" };

type Details = {
  availableVes?: string;
  heldVes?: string;
  pendingVes?: string;
  heldUntil?: string | null;
};

export function usePaymentHold({
  amountVes,
  splitParticipantId,
  enabled,
  tableState = "",
}: {
  amountVes: Money;
  splitParticipantId?: string | undefined;
  enabled: boolean;
  /**
   * Lo que la mesa tiene reservado y avisado ahora, tal como llega en cada
   * relectura de la cuenta. Cuando cambia -- otro vuelve atrás, vence o avisa
   * -- se vuelve a pedir: sin esto, quien quedó bloqueado seguía bloqueado
   * hasta que venciera la reserva del otro aunque el otro ya se hubiera ido.
   */
  tableState?: string;
}): { state: HoldState; retry: () => void } {
  const [state, setState] = useState<HoldState>({ kind: "off" });
  const [attempt, setAttempt] = useState(0);
  const holding = useRef(false);
  const kind = useRef<HoldState["kind"]>("off");
  kind.current = state.kind;
  const want = enabled && BigInt(amountVes || "0") > 0n;

  useEffect(() => {
    if (!want) {
      setState({ kind: "off" });
      return;
    }
    let live = true;
    // La cuenta se vuelve a leer cada pocos segundos; si ya hay reserva, se
    // renueva sin que la pantalla parpadee a «reservando».
    setState((s) => (s.kind === "held" ? s : { kind: "placing" }));

    const place = async (amount: Money, trimmed: boolean): Promise<void> => {
      try {
        const hold = await guest.placeHold({
          amountVes: amount,
          ...(splitParticipantId ? { splitParticipantId } : {}),
        });
        holding.current = true;
        if (live) {
          setState({ kind: "held", amountVes: hold.amountVes, expiresAt: hold.expiresAt, trimmed });
        }
      } catch (err) {
        if (!live) return;
        if (err instanceof ApiError && err.code === "PAYMENT_HELD") {
          const d = err.details as Details;
          const free = BigInt(d.availableVes ?? "0");
          // Otro paga parte: se toma lo que queda libre, una sola vez.
          if (free > 0n && !trimmed) return place(free.toString(), true);
          setState({
            kind: "blocked",
            heldVes: d.heldVes ?? "0",
            pendingVes: d.pendingVes ?? "0",
            heldUntil: d.heldUntil ?? null,
          });
          return;
        }
        // Sin reserva no se bloquea a nadie: se paga como antes.
        setState({ kind: "unavailable" });
      }
    };
    void place(amountVes, false);

    return () => {
      live = false;
    };
  }, [want, amountVes, splitParticipantId, attempt, tableState]);

  // Al salir del paso de pago, la parte vuelve a quedar libre para la mesa.
  useEffect(
    () => () => {
      if (holding.current) {
        holding.current = false;
        guest.releaseHold().catch(() => {
          // Si no llega, vence sola en unos minutos.
        });
      }
    },
    [],
  );

  // Venció mientras el comensal estaba en su banco: se marca, y al volver a la
  // pantalla se pide otra vez (si nadie la tomó entretanto, vuelve a ser suya).
  useEffect(() => {
    if (state.kind !== "held") return;
    const ms = Date.parse(state.expiresAt) - Date.now();
    const timer = setTimeout(() => setState({ kind: "expired" }), Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [state]);

  // Bloqueado: se vuelve a mirar cuando vence la reserva del otro.
  useEffect(() => {
    if (state.kind !== "blocked" || !state.heldUntil) return;
    const ms = Date.parse(state.heldUntil) - Date.now() + 1500;
    const timer = setTimeout(() => setAttempt((n) => n + 1), Math.max(1500, ms));
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (kind.current === "expired" || kind.current === "blocked") setAttempt((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
