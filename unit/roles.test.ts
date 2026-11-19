import { describe, expect, test } from "bun:test";

import {
  canManageMenu,
  canManageTables,
  canVerifyPayments,
  homeFor,
  navFor,
} from "../src/lib/roles";

// Cada regla copia una ruta del backend; si una cambia, este archivo lo dice.
describe("qué ofrece el panel a cada rol (R11)", () => {
  test("cada uno empieza donde trabaja", () => {
    expect(homeFor("OWNER")).toBe("/dashboard");
    expect(homeFor("MANAGER")).toBe("/dashboard");
    expect(homeFor("CASHIER")).toBe("/pagos");
    expect(homeFor("WAITER")).toBe("/mesas");
    expect(homeFor(undefined)).toBe("/dashboard");
  });

  test("la Carta sólo para quien la edita; Pagos para todos", () => {
    expect(navFor("OWNER")).toEqual(["dashboard", "mesas", "menu", "pagos"]);
    expect(navFor("MANAGER")).toContain("menu");
    expect(navFor("CASHIER")).toEqual(["dashboard", "mesas", "pagos"]);
    expect(navFor("WAITER")).toEqual(["dashboard", "mesas", "pagos"]);
  });

  test("los permisos coinciden con el servidor", () => {
    expect(
      ["OWNER", "MANAGER", "CASHIER", "WAITER"].map((r) => canVerifyPayments(r as never)),
    ).toEqual([true, true, true, false]);
    expect(canManageMenu("CASHIER")).toBe(false);
    expect(canManageTables("WAITER")).toBe(false);
    expect(canManageTables("MANAGER")).toBe(true);
    expect(canVerifyPayments(null)).toBe(false);
  });
});
