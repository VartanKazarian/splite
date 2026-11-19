import { describe, expect, test } from "bun:test";

import { badgeOf, isFree, pillToneOf, toneOf } from "../src/components/panel/tableStatus";
import type { FloorTable } from "../src/lib/api";

/**
 * Una mesa, un estado, un color (R12). Se dice lo más urgente primero: un
 * pedido por aprobar o un pago por verificar tienen a alguien esperando.
 */
const table = (
  over: Partial<FloorTable> = {},
  bill: Record<string, unknown> | null = null,
): FloorTable =>
  ({
    id: "t1",
    name: "Mesa 1",
    active: true,
    heldOrders: 0,
    ...over,
    openBill: bill
      ? ({
          id: "b1",
          status: "OPEN",
          totalDueVes: "10000",
          amountPaidVes: "0",
          openMinutes: 20,
          ...bill,
        } as never)
      : null,
  }) as FloorTable;

describe("table status", () => {
  test("free, open, partly paid", () => {
    expect(badgeOf(table()).kind).toBe("free");
    expect(badgeOf(table({}, {})).kind).toBe("open");
    expect(badgeOf(table({}, { amountPaidVes: "2000" })).kind).toBe("partly");
  });

  test("a held order shows even on a table with no bill, and asks for attention", () => {
    const t = table({ heldOrders: 1 });
    expect(badgeOf(t).kind).toBe("approval");
    expect(toneOf(t)).toBe("attention");
    expect(pillToneOf(badgeOf(t))).toBe("urgent");
  });

  test("someone waiting beats everything else", () => {
    const busy = { pendingClaims: 2, payingNow: 1, openMinutes: 13 * 60, amountPaidVes: "2000" };
    expect(badgeOf(table({ heldOrders: 1 }, busy)).kind).toBe("approval");
    expect(badgeOf(table({}, busy)).kind).toBe("claims");
  });

  test("paying now comes before a stale bill and is not an alarm", () => {
    const t = table({}, { payingNow: 1, openMinutes: 13 * 60 });
    expect(badgeOf(t).kind).toBe("payingNow");
    expect(pillToneOf(badgeOf(t))).toBe("good");
    expect(toneOf(t)).toBe("attention"); // still filtered as "por atender" for its age
  });

  test("colours: urgent for someone waiting, soft amber for a reminder, green otherwise", () => {
    expect(pillToneOf(badgeOf(table({}, { pendingClaims: 1 })))).toBe("urgent");
    expect(pillToneOf(badgeOf(table({}, { openMinutes: 13 * 60 })))).toBe("attention");
    expect(pillToneOf(badgeOf(table({}, {})))).toBe("good");
    expect(pillToneOf(badgeOf(table()))).toBe("neutral");
  });

  test("an API without the new fields reads as before", () => {
    // Sin el campo, como respondía la API antes de R12.
    const { heldOrders: _absent, ...old } = table({}, {});
    expect(_absent).toBe(0);
    expect(badgeOf(old as FloorTable).kind).toBe("open");
  });

  test("a table with an order waiting is not free", () => {
    expect(isFree(table())).toBe(true);
    expect(isFree(table({ heldOrders: 1 }))).toBe(false);
    expect(isFree(table({}, {}))).toBe(false);
  });
});
