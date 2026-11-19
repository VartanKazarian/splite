/**
 * Lo que opina el comensal después de pagar (R20).
 *
 * Lo que se queda en el teléfono: que ya valoró este pago, y con cuánto. En
 * `sessionStorage` y no en el servidor porque es sólo para no volver a
 * preguntar en esta visita; la opinión de verdad está en el servidor.
 */

const KEY = (paymentId: string) => `splite.rated.${paymentId}`;

export type Rated = { rating: number; googleReviewUrl: string | null };

export function recallRating(paymentId: string): Rated | null {
  try {
    const raw = sessionStorage.getItem(KEY(paymentId));
    return raw ? (JSON.parse(raw) as Rated) : null;
  } catch {
    return null;
  }
}

export function rememberRating(paymentId: string, rated: Rated) {
  try {
    sessionStorage.setItem(KEY(paymentId), JSON.stringify(rated));
  } catch {
    /* sin almacenamiento, sólo se vuelve a preguntar */
  }
}

/** Las mismas direcciones que acepta el servidor (`services/feedback.js`). */
const GOOGLE_REVIEW_HOSTS = [
  /^g\.page$/,
  /^maps\.app\.goo\.gl$/,
  /^goo\.gl$/,
  /^search\.google\.com$/,
  /^(www\.)?google\.[a-z.]{2,6}$/,
  /^maps\.google\.[a-z.]{2,6}$/,
];

export function isGoogleReviewUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    GOOGLE_REVIEW_HOSTS.some((host) => host.test(url.hostname))
  );
}
