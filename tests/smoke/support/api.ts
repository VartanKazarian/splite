/**
 * El cliente mínimo contra la API, para montar el decorado de cada prueba.
 *
 * El decorado se monta por HTTP y no por SQL a propósito: así la suite corre
 * igual contra la base local y contra un despliegue, y no necesita saber nada
 * del esquema. Lo que se prueba en el navegador es el recorrido; llegar a la
 * mesa con una cuenta abierta no es el recorrido, es el atrezzo.
 */

const RAW_API = process.env["SMOKE_API_URL"] ?? "http://127.0.0.1:4010";
export const API = RAW_API.replace(/\/$/, "");

/**
 * El seguro.
 *
 * Esta suite escribe: crea mesas, productos, cuentas, avisos de pago y toca el
 * RIF. Contra una base de desarrollo eso es gratis; contra la de un local con
 * clientes sentados no lo es -- el RIF se congela con la primera factura y la
 * serie fiscal es la transcripción de una autorización del SENIAT. Así que
 * apuntar a algo que no sea esta máquina tiene que ser una decisión escrita.
 */
export function assertWritableTarget(): void {
  const host = new URL(API).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (local || process.env["SMOKE_ALLOW_REMOTE"] === "1") return;
  throw new Error(
    `Las pruebas de humo escriben en la base de datos y ${API} no es local. ` +
      `Si de verdad quieres correrlas ahí, exporta SMOKE_ALLOW_REMOTE=1.`,
  );
}

export type Auth =
  | { kind: "staff"; token: string }
  | { kind: "guest"; sessionId: string; guestToken: string }
  | { kind: "none" };

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly payload: unknown,
  ) {
    super(`${path} → ${status}: ${JSON.stringify(payload).slice(0, 400)}`);
    this.name = "ApiCallError";
  }
}

async function call<T>(
  method: string,
  path: string,
  { auth = { kind: "none" } as Auth, body }: { auth?: Auth; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth.kind === "staff") headers["authorization"] = `Bearer ${auth.token}`;
  if (auth.kind === "guest") {
    headers["authorization"] = `Bearer ${auth.guestToken}`;
    headers["x-guest-session"] = auth.sessionId;
  }

  const res = await fetch(API + path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* el cuerpo no era JSON; se informa tal cual */
  }
  if (!res.ok) throw new ApiCallError(res.status, `${method} ${path}`, payload);
  return payload as T;
}

export const api = {
  get: <T>(path: string, auth?: Auth) => call<T>("GET", path, auth ? { auth } : {}),
  post: <T>(path: string, body?: unknown, auth?: Auth) =>
    call<T>("POST", path, { ...(auth ? { auth } : {}), ...(body !== undefined ? { body } : {}) }),
  put: <T>(path: string, body: unknown, auth?: Auth) =>
    call<T>("PUT", path, { ...(auth ? { auth } : {}), body }),
};

export type StaffSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number | string;
  user: {
    id: string;
    email: string;
    role: string;
    restaurantId: string;
    displayName?: string | null;
  };
};

/**
 * Quien monta el decorado. Es el mismo dueño con el que entra el personal.
 *
 * La sesión se guarda y se reutiliza durante toda la ejecución, y no por
 * ahorrar una petición: `/api/v1/auth` admite diez llamadas por minuto y por
 * dirección, que es la defensa del producto contra quien prueba contraseñas.
 * Seis recorridos acuñando una sesión cada uno se la comen entera y el que
 * toque después falla con RATE_LIMITED -- un fallo que no dice nada del
 * producto y que además tapa el que sí diría algo.
 */
let cached: Promise<StaffSession> | null = null;

export async function ownerSession(): Promise<StaffSession> {
  const { email, password } = ownerCredentials();
  cached ??= api.post<StaffSession>("/api/v1/auth/login", { email, password });
  try {
    return await cached;
  } catch (error) {
    cached = null;
    // Es el producto protegiéndose y está bien que lo haga; lo que no está
    // bien es que la suite lo cuente como «demasiadas peticiones» y deje a
    // quien la corre buscando qué ha roto.
    if (error instanceof ApiCallError && error.status === 429) {
      throw new Error(
        "La API limita las peticiones por minuto y una ejecución de esta suite " +
          "gasta buena parte del cupo. Has lanzado dos seguidas: espera un minuto " +
          "y vuelve a intentarlo. No has roto nada.",
      );
    }
    throw error;
  }
}

export async function loginOwner(): Promise<Auth & { kind: "staff" }> {
  const session = await ownerSession();
  return { kind: "staff", token: session.accessToken };
}

export const ownerCredentials = () => ({
  email: process.env["SMOKE_EMAIL"] ?? "owner@example.com",
  password: process.env["SMOKE_PASSWORD"] ?? "SpliteDev12345!",
});

/**
 * Una referencia bancaria que no choca con la de otra ejecución.
 *
 * El servidor normaliza a dígitos y rechaza que una misma referencia reclame
 * dos cuentas, así que dos pruebas con "12345678" se pisan: la segunda falla
 * por un motivo que no tiene nada que ver con lo que estaba probando.
 */
export function uniqueReference(): string {
  return String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}
