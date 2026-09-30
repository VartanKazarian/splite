import { describe, expect, test } from "bun:test";

import type { FloorTable } from "../src/lib/api";
import { claimsToAttend } from "../src/components/panel/tableStatus";

const table = (name: string, pendingClaims: number | null): FloorTable =>
  ({
    id: name,
    name,
    openBill: pendingClaims === null ? null : { pendingClaims },
  }) as unknown as FloorTable;

describe("claimsToAttend", () => {
  const floor = [table("Mesa 1", 2), table("Mesa 2", 0), table("Mesa 3", null), table("Mesa 4", 1)];

  test("manda el resumen de Pagos, que ve también las cuentas cerradas", () => {
    expect(claimsToAttend(floor, 4).count).toBe(4);
  });

  test("sin resumen suma mesa por mesa", () => {
    expect(claimsToAttend(floor, undefined)).toEqual({ count: 3, table: null });
  });

  test("con un solo aviso dice de qué mesa", () => {
    const only = [table("Mesa 7", 1), table("Mesa 8", 0)];
    expect(claimsToAttend(only, 1).table?.name).toBe("Mesa 7");
    expect(claimsToAttend(only, undefined).table?.name).toBe("Mesa 7");
  });

  test("no nombra una mesa si el único aviso no está en ella", () => {
    expect(claimsToAttend([table("Mesa 7", 0)], 1)).toEqual({ count: 1, table: null });
    // Las mesas y el resumen se piden por separado y pueden ir un sondeo
    // desfasados: con uno en el resumen y dos por mesas, ninguna es «la» mesa.
    expect(claimsToAttend([table("Mesa 7", 1), table("Mesa 8", 1)], 1)).toEqual({
      count: 1,
      table: null,
    });
  });

  test("si el resumen ve más de uno, no nombra ninguna mesa", () => {
    expect(claimsToAttend([table("Mesa 7", 1)], 2)).toEqual({ count: 2, table: null });
  });
});
