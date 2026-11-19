import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { guest } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRememberedPayment } from "@/lib/guest-payment";
import { recallRating, rememberRating, type Rated } from "@/lib/feedback";

/**
 * «¿Qué tal todo?», después de pagar (R20).
 *
 * Una nota del 1 al 5 y, si quiere, unas palabras. Le llega al restaurante en
 * privado. Y después, **a todo el que valora**, el enlace para dejarlo en
 * Google si el restaurante lo tiene puesto: ofrecérselo sólo a quien puso 4 o
 * 5 está prohibido por Google y puede costarle al restaurante sus reseñas.
 *
 * Sólo con un pago que existe -- por verificar o confirmado --, y una vez por
 * visita: ya valorado, dice gracias y no vuelve a preguntar.
 */
export function GuestRateMeal() {
  const { t } = useI18n();
  const paymentId = useRememberedPayment();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState<Rated | null>(() =>
    paymentId ? recallRating(paymentId) : null,
  );

  // La misma consulta que la oferta de factura: comparte caché, no es otra.
  const status = useQuery({
    queryKey: ["guest-payment", paymentId],
    queryFn: () => guest.paymentStatus(paymentId as string),
    enabled: Boolean(paymentId),
    retry: false,
  });

  const send = useMutation({
    mutationFn: () =>
      guest.rate(paymentId as string, {
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: (data) => {
      const done = { rating, googleReviewUrl: data.googleReviewUrl };
      rememberRating(paymentId as string, done);
      setRated(done);
    },
  });

  if (!paymentId || !status.data) return null;
  if (!["PENDING", "SUCCEEDED"].includes(status.data.status)) return null;

  if (rated) {
    return (
      <section className="surface mt-4 p-5" data-testid="guest-rated">
        <p className="font-display text-lg">{t("rateThanks")}</p>
        {rated.googleReviewUrl ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{t("rateGoogleAsk")}</p>
            <a
              href={rated.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="guest-rate-google"
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary"
            >
              {t("rateGoogleButton")}
            </a>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section className="surface mt-4 p-5" data-testid="guest-rate">
      <h2 className="font-display text-lg">{t("rateTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("rateHint")}</p>

      <div role="radiogroup" aria-label={t("rateTitle")} className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={t("rateStars").replace("{n}", String(value))}
            onClick={() => setRating(value)}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-secondary"
          >
            <Star
              aria-hidden
              className={`h-7 w-7 ${value <= rating ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>

      {rating > 0 ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <label htmlFor="rate-comment" className="field-label">
            {t("rateCommentLabel")}
          </label>
          <textarea
            id="rate-comment"
            value={comment}
            maxLength={500}
            rows={3}
            onChange={(e) => setComment(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
          />
          <button
            type="submit"
            disabled={send.isPending}
            data-testid="guest-rate-send"
            className="mt-2 min-h-11 w-full rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {t("rateSend")}
          </button>
          {send.isError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t("rateFailed")}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
