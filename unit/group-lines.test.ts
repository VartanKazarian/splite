import { describe, expect, test } from "bun:test";

import { groupLines, mineInGroup, spreadInGroup } from "@/components/guest-bill/helpers";

const line = (id: string, name: string, quantity: number, unit: string) => ({
  id,
  name,
  quantity,
  unitPriceMinor: unit,
  subtotalMinor: String(Number(unit) * quantity),
});

describe("groupLines: una línea por plato en la cuenta del comensal", () => {
  const items = [
    line("a", "Tequeños", 1, "800"),
    line("b", "Cerveza", 1, "300"),
    line("c", "Tequeños", 2, "800"),
    line("d", "Tequeños", 1, "900"),
  ];

  test("junta el mismo plato al mismo precio, en el orden de la cuenta", () => {
    const groups = groupLines(items);
    expect(groups.map((g) => [g.id, g.name, g.quantity, g.subtotalMinor])).toEqual([
      ["a", "Tequeños", 3, "2400"],
      ["b", "Cerveza", 1, "300"],
      ["d", "Tequeños", 1, "900"],
    ]);
    expect(groups[0]!.lines).toEqual([
      { id: "a", quantity: 1 },
      { id: "c", quantity: 2 },
    ]);
  });

  test("no toca las líneas originales", () => {
    groupLines(items);
    expect(items[0]!.quantity).toBe(1);
  });

  test("una clave extra separa lo que no se puede juntar", () => {
    const taxed = [
      { ...line("a", "Agua", 1, "100"), tax: "TAXABLE" },
      { ...line("b", "Agua", 1, "100"), tax: "EXEMPT" },
    ];
    expect(groupLines(taxed, (l) => l.tax)).toHaveLength(2);
  });

  test("lo marcado se reparte llenando las líneas en orden, y se suma igual", () => {
    const [teq] = groupLines(items);
    expect(spreadInGroup(teq!, 2)).toEqual([
      ["a", 1, 1],
      ["c", 1, 2],
    ]);
    expect(spreadInGroup(teq!, 0)).toEqual([
      ["a", 0, 1],
      ["c", 0, 2],
    ]);
    expect(mineInGroup(teq!, { a: 1, c: 1 })).toBe(2);
  });
});
