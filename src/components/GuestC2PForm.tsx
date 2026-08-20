import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  ApiError,
  formatMinor,
  formatMoney,
  guest,
  newIdempotencyKey,
  parseMinorInput,
  type C2PBankClave,
  type C2PChargeResult,
} from "@/lib/api";

const ID_TYPES = ["V", "E", "J", "G", "P", "C"] as const;

/**
 * Cargo C2P contra el banco del propio comensal.
 *
 * Dos reglas que no se pueden relajar:
 *  - La clave es de un solo uso: se enmascara, no se guarda en ningún sitio y se
 *    borra del estado en cuanto se envía.
 *  - La clave de idempotencia se genera una vez por intento y se reutiliza mientras
 *    el cargo siga sin resolverse. Generar otra puede cobrar dos veces.
 */
export function GuestC2PForm({
  maxVes,
  demo,
}: {
  maxVes: string;
  demo: boolean;
}) {

  const banksQuery = useQuery({
    queryKey: ["c2p-banks"],
    enabled: !demo,
    retry: false,
    // La clave puede ir atada al monto: la guía se pide en el momento de pagar.
    staleTime: 0,
    queryFn: () => guest.c2pBanks(),
  });

  const banks: C2PBankClave[] = demo
    ? [
        {
          bankCode: "0105",
          bankName: "Mercantil",
          ttlMinutes: 5,
          ttlLabel: "5 minutos",
          amountBound: true,
          strategy: { when: "at_payment", reason: "La clave caduca rápido." },
          channels: [{ channel: "SMS", text: "Envía CLAVE al 2383", shortCode: "2383" }],
        },
      ]
    : (banksQuery.data ?? []);

  const [bankCode, setBankCode] = useState("");
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]>("V");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [clave, setClave] = useState("");
  const [amount, setAmount] = useState(() => formatMinor(maxVes || "0"));
  const [result, setResult] = useState<C2PChargeResult | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  // Una clave por intento. Sólo se renueva cuando el intento anterior quedó cerrado.
  const idemRef = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!bankCode && banks[0]) setBankCode(banks[0].bankCode);
  }, [banks, bankCode]);

  const selected = useMemo(
    () => banks.find((b) => b.bankCode === bankCode) ?? null,
    [banks, bankCode],
  );

  const amountMinor = parseMinorInput(amount) || "0";
  const idOk = /^[0-9]{6,9}$/.test(idNumber.trim());
  const phoneOk = /^(0412|0414|0416|0424|0426)[0-9]{7}$/.test(phone.replace(/\D/g, ""));
  const claveOk = /^[0-9]{4,16}$/.test(clave);

  const unresolved = result?.status === "IN_DOUBT" || result?.status === "AMBIGUOUS";

  const charge = useMutation({
    mutationFn: async (): Promise<C2PChargeResult> => {
      if (demo) {
        return { paymentId: "demo", status: "SUCCEEDED", reason: null };
      }
      return guest.c2pCharge({
        amountVes: amountMinor,
        bankCode,
        idNumber: `${idType}${idNumber.trim()}`,
        phone: phone.replace(/\D/g, ""),
        clave,
        idempotencyKey: idemRef.current,
        ...(splitParticipantId ? { splitParticipantId } : {}),
      });
    },
    onSettled: () => {
      // La clave no sobrevive al envío, ni siquiera en memoria del formulario.
      setClave("");
    },
    onSuccess: (data) => {
      setError(null);
      setResult(data);
    },
    onError: (err) => {
      setResult(null);
      if (!(err instanceof ApiError)) {
        setError({ message: "No pudimos contactar al banco. Intenta de nuevo." });
        return;
      }
      const map: Record<string, string> = {
        PAYMENT_EXCEEDS_BALANCE: "Ese monto supera lo que falta por pagar.",
        BILL_NOT_OPEN: "Esta cuenta ya fue cerrada. Habla con el mesero.",
        OPEN_BILL_NOT_FOUND: "Esta cuenta ya fue cerrada. Habla con el mesero.",
        VALIDATION_FAILED: "Revisa los datos: banco, cédula, teléfono y clave.",
        GUEST_SESSION_INVALID: "Tu sesión venció. Vuelve a escanear el QR de la mesa.",
        RATE_LIMITED: "Demasiados intentos. Espera un momento.",
        PAYMENT_PROVIDER_UNAVAILABLE: "El banco no responde ahora mismo. Intenta en un minuto.",
        C2P_NOT_ENABLED: "Este restaurante todavía no acepta pago C2P en la app.",
      };
      setError({
        message: map[err.code] ?? "El banco rechazó la operación. Intenta de nuevo.",
        requestId: err.requestId,
      });
    },
  });

  const canSubmit =
    !charge.isPending &&
    !unresolved &&
    Boolean(bankCode) &&
    idOk &&
    phoneOk &&
    claveOk &&
    BigInt(amountMinor) > 0n;

  const field =
    "mt-2 w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-base outline-none focus:border-ring";

  if (result) {
    const tone =
      result.status === "SUCCEEDED"
        ? "border-primary/50 bg-primary/10"
        : result.status === "FAILED"
          ? "border-destructive/50 bg-destructive/10"
          : "border-amber-500/50 bg-amber-500/10";
    return (
      <div className={`mt-5 rounded-lg border p-4 ${tone}`}>
        <p className="font-display text-2xl">
          {result.status === "SUCCEEDED"
            ? "Pago confirmado"
            : result.status === "FAILED"
              ? "El banco rechazó el pago"
              : result.status === "IN_DOUBT"
                ? "Pago sin confirmar"
                : "Pago en revisión"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.status === "SUCCEEDED"
            ? "Tu parte quedó registrada en la cuenta."
            : result.status === "FAILED"
              ? "No se debitó nada de tu cuenta. Puedes intentarlo con una clave nueva."
              : result.status === "IN_DOUBT"
                ? "El banco no dio una respuesta clara. Puede que el débito sí haya salido, así que no vuelvas a pagar: el personal lo va a verificar con el banco."
                : "El débito se confirmó pero no se pudo acreditar a esta cuenta. El personal tiene que revisarlo."}
        </p>
        {result.status === "FAILED" && (
          <button
            type="button"
            onClick={() => {
              // Un FAILED no dejó débito: es seguro empezar un intento nuevo.
              idemRef.current = newIdempotencyKey();
              setResult(null);
            }}
            className="mt-3 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
          >
            Intentar de nuevo
          </button>
        )}
        {result.reason && (
          <p className="mt-2 text-[11px] text-muted-foreground">{result.reason}</p>
        )}
        {result.bankReference && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Referencia del banco: {result.bankReference}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="mt-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        charge.mutate();
      }}
    >
      <p className="text-xs text-muted-foreground">
        Paga desde tu propio banco sin salir de aquí. Necesitas una clave C2P de un solo uso.
      </p>

      <div className="mt-4">
        <label htmlFor="c2p-bank" className="text-xs uppercase tracking-widest text-muted-foreground">
          Tu banco
        </label>
        <select
          id="c2p-bank"
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          className={field}
        >
          {banks.length === 0 && <option value="">—</option>}
          {banks.map((b) => (
            <option key={b.bankCode} value={b.bankCode}>
              {b.bankName ?? b.bankCode}
            </option>
          ))}
        </select>
        {banksQuery.isError && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            No pudimos cargar la lista de bancos.
          </p>
        )}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
          <p>Tu clave dura {selected.ttlLabel}.</p>
          {selected.channels.map((c) => (
            <p key={c.channel} className="mt-1">
              {c.channel}: {c.text}
            </p>
          ))}
          {selected.amountBound && (
            <p className="mt-1">
              La clave va atada al monto: pídela justo antes de pagar y por este monto exacto.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-[80px_1fr] gap-2">
        <div>
          <label htmlFor="c2p-idtype" className="text-xs uppercase tracking-widest text-muted-foreground">
            Tipo
          </label>
          <select
            id="c2p-idtype"
            value={idType}
            onChange={(e) => setIdType(e.target.value as (typeof ID_TYPES)[number])}
            className={field}
          >
            {ID_TYPES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="c2p-id" className="text-xs uppercase tracking-widest text-muted-foreground">
            Cédula o RIF
          </label>
          <input
            id="c2p-id"
            inputMode="numeric"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
            className={field}
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="c2p-phone" className="text-xs uppercase tracking-widest text-muted-foreground">
          Teléfono afiliado
        </label>
        <input
          id="c2p-phone"
          inputMode="numeric"
          placeholder="04121234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
          className={field}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="c2p-amount" className="text-xs uppercase tracking-widest text-muted-foreground">
          Monto a pagar (Bs)
        </label>
        <input
          id="c2p-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={field}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Máximo {formatMoney(maxVes || "0", "VES")}. Puedes pagar solo tu parte.
        </p>
      </div>

      <div className="mt-4">
        <label htmlFor="c2p-clave" className="text-xs uppercase tracking-widest text-muted-foreground">
          Clave C2P
        </label>
        <input
          id="c2p-clave"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={clave}
          onChange={(e) => setClave(e.target.value.replace(/\D/g, "").slice(0, 16))}
          className={field}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          De un solo uso. No la guardamos ni queda registrada en ningún sitio.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs">
          <p>{error.message}</p>
          {error.requestId && (
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              Referencia: {error.requestId}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-5 w-full rounded-lg border border-primary bg-primary/15 px-4 py-3 text-sm text-foreground transition-colors disabled:opacity-40"
      >
        {charge.isPending ? "Contactando al banco…" : "Pagar con C2P"}
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        El débito sale de tu cuenta hacia la del restaurante. Splite no retiene el dinero.
      </p>
    </form>
  );
}
