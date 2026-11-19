import { describe, expect, test } from "bun:test";

import { ApiError, NetworkError } from "../src/lib/api";
import type { Key } from "../src/lib/i18n";
import { errorStrings } from "../src/lib/i18n-errors";
import { staffErrorReference, staffErrorText } from "../src/lib/staff-errors";

/** La única frase del diccionario común que usa el ayudante. */
const API_DOWN = {
  es: "No hay conexión con el servidor de Splite.",
  en: "No connection to the Splite server.",
};

/** El `t` de cada idioma, sin React. */
const tIn = (lang: "es" | "en") => (key: Key) =>
  key === "apiDown" ? API_DOWN[lang] : ((errorStrings[lang] as Record<string, string>)[key] ?? key);

const apiError = (
  code: string,
  extra: { details?: Record<string, unknown>; requestId?: string } = {},
) =>
  new ApiError(409, {
    code,
    message: "English message from the backend",
    details: extra.details ?? {},
    requestId: extra.requestId ?? "",
  });

describe("errores del servidor para el personal", () => {
  test("un código conocido es una frase en el idioma del panel, sin el mensaje en inglés", () => {
    const es = staffErrorText(apiError("TABLE_NAME_TAKEN"), tIn("es"));
    const en = staffErrorText(apiError("TABLE_NAME_TAKEN"), tIn("en"));
    expect(es).toBe("Ya hay una mesa con ese nombre.");
    expect(en).toBe("There's already a table with that name.");
    expect(es).not.toContain("TABLE_NAME_TAKEN");
    expect(es).not.toContain("English message");
  });

  test("uno desconocido dice que falló y da el código para soporte", () => {
    const text = staffErrorText(apiError("SOMETHING_NEW"), tIn("es"));
    expect(text).toContain("SOMETHING_NEW");
    expect(text).not.toContain("English message");
  });

  test("sin respuesta del servidor, que no hay conexión", () => {
    expect(staffErrorText(new TypeError("Failed to fetch"), tIn("es"))).toBe(API_DOWN.es);
    expect(staffErrorText(new NetworkError("offline"), tIn("en"))).toBe(API_DOWN.en);
  });

  test("demasiadas peticiones dice cuánto esperar", () => {
    const text = staffErrorText(
      apiError("RATE_LIMITED", { details: { retryAfterSeconds: 12 } }),
      tIn("es"),
    );
    expect(text).toContain("12");
  });

  test("la referencia para soporte es el código y el principio del id de la petición", () => {
    const ref = staffErrorReference(
      apiError("FORBIDDEN_ROLE", { requestId: "e2ff2b7c-039f-4448-90e1-8a4aba63ae7d" }),
      tIn("es"),
    );
    expect(ref).toBe("Código FORBIDDEN_ROLE · ref. e2ff2b7c");
    expect(staffErrorReference(new TypeError("x"), tIn("es"))).toBeNull();
  });

  test("cada código con frase tiene su frase en los dos idiomas", () => {
    expect(Object.keys(errorStrings.en).sort()).toEqual(Object.keys(errorStrings.es).sort());
  });
});
