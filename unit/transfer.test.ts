import { describe, expect, test } from "bun:test";

import { apportionTransfer } from "../src/lib/transfer";

const split = (transferredVes: string, tipVes: string, shareVes: string) =>
  apportionTransfer({ transferredVes, tipVes, shareVes });

describe("apportionTransfer", () => {
  test("lo sugerido: parte + propina exactas", () => {
    expect(split("11000", "1000", "10000")).toEqual({ amountVes: "10000", tipVes: "1000" });
  });

  test("sin propina, todo a la cuenta", () => {
    expect(split("10000", "0", "10000")).toEqual({ amountVes: "10000", tipVes: "0" });
  });

  test("el error de antes: un importe menor que la propina no declara la propina entera", () => {
    // Antes: amountVes 800 y tipVes 1000 -> 1.800 avisados por 800 transferidos.
    expect(split("800", "1000", "10000")).toEqual({ amountVes: "800", tipVes: "0" });
  });

  test("una transferencia corta se queda sin propina antes que sin cuenta", () => {
    expect(split("10500", "1000", "10000")).toEqual({ amountVes: "10000", tipVes: "500" });
    expect(split("9000", "1000", "10000")).toEqual({ amountVes: "9000", tipVes: "0" });
  });

  test("lo que sobra va a la cuenta, para que el servidor diga el máximo", () => {
    expect(split("12000", "1000", "10000")).toEqual({ amountVes: "11000", tipVes: "1000" });
  });

  test("nada transferido, nada avisado", () => {
    expect(split("0", "1000", "10000")).toEqual({ amountVes: "0", tipVes: "0" });
    expect(split("", "1000", "10000")).toEqual({ amountVes: "0", tipVes: "0" });
  });

  test("las dos partes siempre suman lo transferido", () => {
    for (const sent of [1n, 500n, 999n, 1000n, 9999n, 10000n, 10999n, 11000n, 50000n]) {
      for (const tip of [0n, 1n, 1000n, 20000n]) {
        const r = split(sent.toString(), tip.toString(), "10000");
        expect(BigInt(r.amountVes) + BigInt(r.tipVes)).toBe(sent);
        expect(BigInt(r.tipVes) <= tip).toBe(true);
      }
    }
  });
});
