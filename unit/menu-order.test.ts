import { describe, expect, test } from "bun:test";

import type { Product } from "../src/lib/api";
import { moveBy, sortLikeMenu, withSectionOrder } from "../src/lib/menu-order";

const dish = (name: string, categoryId: string | null, position = 0, active = true): Product =>
  ({ id: name, name, categoryId, position, active }) as unknown as Product;

describe("sortLikeMenu", () => {
  const rank = new Map([
    ["entradas", 0],
    ["postres", 1],
  ]);

  test("sección, después el puesto; el nombre sólo desempata", () => {
    const out = sortLikeMenu(
      [
        dish("Quesillo", "postres", 0),
        dish("Tostones", "entradas", 0),
        dish("Tequeños", "entradas", 1),
      ],
      rank,
    );
    expect(out.map((p) => p.name)).toEqual(["Tostones", "Tequeños", "Quesillo"]);
  });

  test("un plato agotado no se va al final: sigue en su puesto", () => {
    const out = sortLikeMenu([dish("A", "entradas", 1), dish("B", "entradas", 0, false)], rank);
    expect(out.map((p) => p.name)).toEqual(["B", "A"]);
  });

  test("sin sección va al final", () => {
    const out = sortLikeMenu([dish("Suelto", null), dish("Quesillo", "postres")], rank);
    expect(out.map((p) => p.name)).toEqual(["Quesillo", "Suelto"]);
  });
});

describe("moveBy", () => {
  test("mueve un puesto", () => {
    expect(moveBy(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveBy(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  test("en los extremos devuelve la misma lista, sin copiarla", () => {
    const list = ["a", "b"];
    expect(moveBy(list, 0, -1)).toBe(list);
    expect(moveBy(list, 1, 1)).toBe(list);
  });
});

describe("withSectionOrder", () => {
  test("renumera la sección y deja las demás como estaban", () => {
    const list = [dish("a", "s", 0), dish("b", "s", 1), dish("x", "otra", 7)];
    const out = withSectionOrder(list, ["b", "a"]);
    expect(out.map((p) => [p.name, p.position])).toEqual([
      ["a", 1],
      ["b", 0],
      ["x", 7],
    ]);
    expect(out[2]).toBe(list[2]);
  });
});
