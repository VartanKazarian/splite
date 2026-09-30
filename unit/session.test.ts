import { describe, expect, test } from "bun:test";

import { ApiError, refreshFailureEndsSession } from "../src/lib/api";

const failure = (status: number) =>
  new ApiError(status, { code: "X", message: "x", requestId: "r" } as ConstructorParameters<
    typeof ApiError
  >[1]);

describe("refreshFailureEndsSession", () => {
  test("el servidor rechaza la renovación: la sesión se acabó", () => {
    expect(refreshFailureEndsSession(failure(401))).toBe(true);
    expect(refreshFailureEndsSession(failure(403))).toBe(true);
  });

  test("un límite, un fallo del servidor o la red caída no cierran la sesión", () => {
    expect(refreshFailureEndsSession(failure(429))).toBe(false);
    expect(refreshFailureEndsSession(failure(500))).toBe(false);
    expect(refreshFailureEndsSession(failure(503))).toBe(false);
    expect(refreshFailureEndsSession(new TypeError("Failed to fetch"))).toBe(false);
    expect(refreshFailureEndsSession(undefined)).toBe(false);
  });
});
