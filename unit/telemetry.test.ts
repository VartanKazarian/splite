import { describe, expect, test } from "bun:test";

import { isNoise, surfaceOf } from "../src/lib/telemetry";

describe("lo que se cuenta de los navegadores (FR4)", () => {
  test("cada página dice de qué parte de Splite es", () => {
    expect(surfaceOf("/t/abc")).toBe("guest");
    expect(surfaceOf("/recibo/x.y")).toBe("guest");
    expect(surfaceOf("/pagos")).toBe("staff");
    expect(surfaceOf("/settings")).toBe("staff");
    expect(surfaceOf("/admin/cobros")).toBe("admin");
    expect(surfaceOf("/")).toBe("public");
    expect(surfaceOf("/tasas")).toBe("public");
  });

  test("el ruido de extensiones y del navegador no se manda", () => {
    expect(isNoise("x", "at chrome-extension://abc/content.js:1")).toBe(true);
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(
      isNoise("Cannot read properties of undefined", "at pay (https://splite.lat/assets/a.js:1:2)"),
    ).toBe(false);
  });
});
