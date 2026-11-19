import { describe, expect, test } from "bun:test";

import { keyBytes, pushSupport } from "../src/lib/push";

describe("avisos en el teléfono (R19)", () => {
  test("la clave del servidor llega a `subscribe` como los 65 bytes de P-256", () => {
    // Un par VAPID real: la clave pública empieza por 0x04 (punto sin comprimir).
    const key =
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    const bytes = keyBytes(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });

  test("en el servidor no hay navegador, y se dice sin romper", () => {
    expect(pushSupport()).toBe("unsupported");
  });
});
