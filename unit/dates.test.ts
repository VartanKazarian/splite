import { describe, expect, test } from "bun:test";

import { formatDateTime, formatTime } from "../src/lib/dates";

describe("las horas del local", () => {
  test("se cuentan en la hora de Caracas, mire quien mire", () => {
    // 01:14 UTC del 20 de noviembre = 21:14 del 19 en Caracas (UTC-4).
    const iso = "2026-11-20T01:14:00Z";
    expect(formatTime(iso, "es")).toMatch(/09:14|21:14/);
    expect(formatDateTime(iso, "es")).toContain("19");
    expect(formatDateTime(iso, "en")).toContain("19");
  });
});
