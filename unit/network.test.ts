import { afterEach, describe, expect, test } from "bun:test";

import { ApiError, NetworkError, apiRequest } from "../src/lib/api";

/** Una red que no contesta nunca, salvo que se corte la petición. */
const hangingFetch = ((_url: string, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  })) as unknown as typeof fetch;

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

describe("una red que falla no deja la pantalla colgada", () => {
  test("sin respuesta, se corta y se dice que fue por tiempo", async () => {
    globalThis.fetch = hangingFetch;
    const started = Date.now();
    const error = await apiRequest("/api/v1/health", { timeoutMs: 50 }).catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).kind).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("sin red, se dice que no hay conexión", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;
    const error = await apiRequest("/api/v1/health").catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).kind).toBe("offline");
    // Y no es un error del servidor: las pantallas que ya decían «no hay
    // conexión» para lo que no es un ApiError siguen igual.
    expect(error).not.toBeInstanceOf(ApiError);
  });
});
