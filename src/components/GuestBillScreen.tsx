import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  formatBps,
  formatFxRate,
  formatMinor,
  formatMoney,
  guest,
  guestSession,
  type Bill,
  type MenuCurrency,
  type SplitMode,
  type SplitPreview,
} from "@/lib/api";


import { ErrorBox } from "@/routes/dashboard";

type Participant = { id: string; name: string };

export function GuestBillScreen({ qr }: { qr?: string }) {
  const { t } = useI18n();
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<unknown>(null);

  // El QR trae un token firmado: se canjea una sola vez por sesión de invitado.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clean = () => {
        if (!qr || typeof window === "undefined") return;
        // El token no debe quedar en la barra de direcciones ni en capturas.
        const url = new URL(window.location.href);
        url.searchParams.delete("qr");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      };
      try {
        // Cualquier móvil, sin login: el token del QR siempre abre sesión nueva
        // (una sesión vieja en sessionStorage podría ser de otra mesa o estar caducada).
        if (qr) {
          guestSession.set(null);
          await guest.openSession(qr);
        }
        clean();
        if (!cancelled) setSessionReady(Boolean(guestSession.get()));
      } catch (error) {
        clean();
        if (!cancelled) setSessionError(error);
      }

    })();
    return () => {
      cancelled = true;
    };
  }, [qr]);

  const billQuery = useQuery({
    queryKey: ["guest-bill"],
    enabled: sessionReady,
    retry: false,
    // El personal añade productos mientras la gente está sentada: sondeo cada 5s.
    refetchInterval: 5000,
    queryFn: async (): Promise<Bill | null> => {
      try {
        return await guest.bill<Bill>();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });


  const [mode, setMode] = useState<SplitMode>("FULL");
  const [people, setPeople] = useState<Participant[]>([
    { id: "p1", name: "" },
    { id: "p2", name: "" },
  ]);
  const [claims, setClaims] = useState<Record<string, string[]>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<SplitPreview | null>(null);

  const bill = billQuery.data ?? null;

  const splitMutation = useMutation({
    mutationFn: async () => {
      const participants =
        mode === "FULL"
          ? [{ id: "p1", name: people[0]?.name || "" }]
          : people.map((p) => ({
              id: p.id,
              ...(p.name ? { name: p.name } : {}),
              ...(mode === "CUSTOM"
                ? { amountVes: (amounts[p.id] ?? "").replace(/\D/g, "") }
                : {}),
            }));
      const body = {
        mode,
        participants,
        ...(mode === "ITEMS"
          ? {
              claims: (bill?.items ?? []).map((item) => ({
                itemId: item.id,
                participantIds: claims[item.id] ?? [],
              })),
            }
          : {}),
      };
      // El reparto lo calcula el servidor: nunca se divide en el cliente.
      return guest.splitPreview<SplitPreview>(body);
    },
    onSuccess: setPreview,
    onError: () => setPreview(null),
  });

  const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : undefined);

  if (sessionError || (!sessionReady && !qr)) {
    const code = codeOf(sessionError);
    return (
      <Shell>
        <h1 className="text-3xl">{t("yourBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {code === "QR_INVALID" || code === "QR_TOKEN_INVALID"
            ? t("qrInvalid")
            : code === "GUEST_SESSION_INVALID"
              ? t("sessionExpired")
              : t("scanNeeded")}
        </p>
        {sessionError && !code ? <ErrorBox error={sessionError} fallback={t("apiDown")} /> : null}
      </Shell>
    );
  }

  if (!sessionReady || billQuery.isLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </Shell>
    );
  }

  if (billQuery.isError) {
    const code = codeOf(billQuery.error);
    if (code === "GUEST_SESSION_INVALID") {
      guestSession.set(null);
      return (
        <Shell>
          <h1 className="text-3xl">{t("yourBill")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("sessionExpired")}</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="text-3xl">{t("errorTitle")}</h1>
        <ErrorBox error={billQuery.error} fallback={t("apiDown")} />
      </Shell>
    );
  }

  if (!bill) {
    return (
      <Shell>
        <h1 className="text-3xl">{t("noOpenBill")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("oneOpenBill")}</p>
      </Shell>
    );
  }

  const modes: { id: SplitMode; label: string }[] = [
    { id: "FULL", label: t("payAll") },
    { id: "ITEMS", label: t("splitItems") },
    { id: "EQUAL", label: t("splitEven") },
    { id: "CUSTOM", label: t("custom") },
  ];

  const toggleClaim = (itemId: string, participantId: string) =>
    setClaims((prev) => {
      const current = prev[itemId] ?? [];
      return {
        ...prev,
        [itemId]: current.includes(participantId)
          ? current.filter((id) => id !== participantId)
          : [...current, participantId],
      };
    });

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16">
      <header className="flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("brand")}
        </Link>
        <LangToggle />
      </header>

      <div className="surface p-6">
        <h1 className="text-3xl">{t("yourBill")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("quotedIn")} {bill.currency} · {t("settlementVes")}
        </p>

        <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          {(bill.items ?? []).map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span>{formatMoney(item.subtotalMinor, bill.currency)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
          <MoneyRow label={t("subtotal")} amount={bill.subtotalMinor} currency={bill.currency} />
          <MoneyRow
            label={`${t("iva")} ${formatBps(bill.vatBps)}`}
            amount={bill.vatMinor}
            currency={bill.currency}
          />
          <MoneyRow
            label={`${t("service")} ${formatBps(bill.serviceChargeBps)}`}
            amount={bill.serviceChargeMinor}
            currency={bill.currency}
          />
          <MoneyRow label={t("total")} amount={bill.totalDue} currency={bill.currency} highlight />
        </div>

        {bill.currency !== "VES" && (
          <div className="mt-4 space-y-1 border-t border-border pt-4">
            <div className="flex items-baseline justify-between text-foreground">
              <span className="text-xs uppercase tracking-widest">{t("totalPayable")}</span>
              <span className="font-display text-3xl">
                {formatMoney(bill.totalDueVes, "VES")}
              </span>
            </div>
            {(bill.fxRateVesPerUnit ?? bill.fxRate) && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("bcvRate")}</span>
                <span>{formatFxRate(bill.fxRateVesPerUnit ?? bill.fxRate!)}</span>
              </div>
            )}
          </div>
        )}

        {BigInt(bill.amountPaidVes ?? "0") > 0n && (
          <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
            <MoneyRow label={t("alreadyPaid")} amount={bill.amountPaidVes} currency="VES" />
            <div className="flex items-baseline justify-between pt-2 text-foreground">
              <span>{t("outstanding")}</span>
              <span className="font-display text-2xl">
                {formatMoney(bill.remainingVes, "VES")}
              </span>
            </div>
          </div>
        )}
      </div>


      <div className="surface mt-4 p-6">
        <div className="grid grid-cols-2 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMode(m.id);
                setPreview(null);
              }}
              className={`rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                mode === m.id
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode !== "FULL" && (
          <div className="mt-5 space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("participants")}
            </p>
            {people.map((p, index) => (
              <div key={p.id} className="flex items-center gap-2">
                <input
                  placeholder={`${t("name")} ${index + 1}`}
                  value={p.name}
                  onChange={(e) =>
                    setPeople((prev) =>
                      prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="w-full rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
                />
                {mode === "CUSTOM" && (
                  <input
                    inputMode="numeric"
                    placeholder="Bs. céntimos"
                    value={amounts[p.id] ?? ""}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    className="w-36 rounded-lg border border-input bg-secondary px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                )}
                {people.length > 1 && (
                  <button
                    onClick={() => setPeople((prev) => prev.filter((x) => x.id !== p.id))}
                    className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground"
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setPeople((prev) => [...prev, { id: `p${prev.length + 1}-${Date.now()}`, name: "" }])
              }
              className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground"
            >
              + {t("addPerson")}
            </button>
          </div>
        )}

        {mode === "ITEMS" && (
          <div className="mt-5 space-y-3">
            <p className="text-xs text-muted-foreground">{t("claimItems")}</p>
            {(bill.items ?? []).map((item) => (
              <div key={item.id} className="rounded-lg bg-secondary/60 p-3">
                <p className="text-sm">{item.name}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {people.map((p, i) => {
                    const on = (claims[item.id] ?? []).includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleClaim(item.id, p.id)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          on ? "border-primary bg-primary/20" : "border-border text-muted-foreground"
                        }`}
                      >
                        {p.name || `${t("name")} ${i + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => splitMutation.mutate()}
          disabled={splitMutation.isPending}
          className="mt-6 w-full rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {splitMutation.isPending ? t("loading") : t("previewSplit")}
        </button>

        {splitMutation.isError && (
          <ErrorBox error={splitMutation.error} fallback={t("apiDown")} />
        )}

        {preview && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("allocations")}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {preview.allocations.map((a) => (
                <li key={a.participantId} className="flex justify-between">
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-success" />
                    {a.name || a.participantId}
                  </span>
                  <span>
                    Bs. {formatMinor(a.amountVes)}
                    {a.usdReference && (
                      <span className="ml-2 text-xs text-muted-foreground">${a.usdReference}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{t("outstanding")}</span>
              <span>Bs. {formatMinor(preview.outstandingVes)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("allocated")}</span>
              <span>Bs. {formatMinor(preview.totalAllocatedVes)}</span>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t("largestRemainder")}. {t("guestNoPay")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  amount,
  currency,
  highlight,
}: {
  label: string;
  amount: string;
  currency: MenuCurrency;
  highlight?: boolean;
}) {
  return (
    <div className={`flex justify-between ${highlight ? "text-foreground" : ""}`}>
      <span>{label}</span>
      <span>{formatMoney(amount, currency)}</span>
    </div>
  );
}


function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5">
      <header className="flex items-center justify-between py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Mesa
        </Link>
        <LangToggle />
      </header>
      <div className="surface p-6">{children}</div>
    </div>
  );
}
