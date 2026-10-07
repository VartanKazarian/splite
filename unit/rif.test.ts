import { describe, expect, test } from "bun:test";

import { formatRif, normaliseRif } from "../src/lib/rif";

describe("normaliseRif", () => {
  test("con guiones, en minúsculas o con ceros, es el mismo RIF", () => {
    expect(normaliseRif("J-30724328-7")).toBe("J307243287");
    expect(normaliseRif("j307243287")).toBe("J307243287");
    expect(normaliseRif("J000000307243287")).toBe("J307243287");
    expect(normaliseRif(" V-12.345.678 ")).toBe("V12345678");
  });

  test("sin letra, con otra letra o demasiado corto no es un RIF", () => {
    for (const bad of ["", "307243287", "X307243287", "J12", "J1234567890123456"]) {
      expect(normaliseRif(bad)).toBeNull();
    }
  });
});

describe("formatRif", () => {
  test("letra, número y dígito verificador separados", () => {
    expect(formatRif("J307243287")).toBe("J-30724328-7");
    expect(formatRif(null)).toBe("");
  });
});
