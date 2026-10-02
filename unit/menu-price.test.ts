import { describe, expect, test } from "bun:test";

import { formatRate, formatValueDate, vesEquivalent } from "../src/lib/menu-price";

describe("vesEquivalent", () => {
  test("8,00 $ a 757,5406 Bs/$ son 6.060,32 Bs", () => {
    expect(vesEquivalent("800", { rate: "757.54060000" })).toBe("606032");
  });

  test("sin tasa no se inventa un equivalente", () => {
    expect(vesEquivalent("800", null)).toBeNull();
    expect(vesEquivalent("800", undefined)).toBeNull();
  });

  test("una tasa rota tampoco", () => {
    expect(vesEquivalent("800", { rate: "no-es-una-tasa" })).toBeNull();
  });

  test("redondea al céntimo, no trunca", () => {
    // 1 centavo × 757,5406 = 757,5406 céntimos → 758, no 757
    expect(vesEquivalent("1", { rate: "757.5406" })).toBe("758");
  });
});

describe("formatRate", () => {
  test("dos decimales y miles a la venezolana", () => {
    expect(formatRate("757.54060000")).toBe("757,54");
    expect(formatRate("1234.5")).toBe("1.234,50");
  });
});

describe("formatValueDate", () => {
  test("la fecha valor no se corre por la zona horaria del teléfono", () => {
    expect(formatValueDate("2026-10-02", "es")).toContain("2");
    expect(formatValueDate("2026-10-02", "es")).not.toContain("1 ");
  });

  test("sin fecha, nada", () => {
    expect(formatValueDate(null, "es")).toBe("");
  });
});
