import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { guestStrings } from "../src/lib/i18n-guest";
import { publicStrings } from "../src/lib/i18n-public";
import { staffStrings } from "../src/lib/i18n-staff";

/**
 * El diccionario va por partes (`lib/i18n.tsx`, «Por partes»): cada archivo que
 * usa una clave de una parte tiene que importarla, o en esa página la clave
 * sale tal cual («pushTitle») en vez de la frase. Esto lo comprueba leyendo el
 * código: cualquier texto entre comillas que sea una clave de una parte.
 */

const SRC = join(import.meta.dir, "..", "src");
const parts = { guest: guestStrings, staff: staffStrings, public: publicStrings } as const;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith("routeTree.gen.ts") ? [path] : [];
  });
}

describe("el diccionario por partes", () => {
  test("ninguna clave está en dos partes, y el inglés tiene las mismas que el español", () => {
    const seen = new Map<string, string>();
    for (const [name, part] of Object.entries(parts)) {
      expect(Object.keys(part.en).sort()).toEqual(Object.keys(part.es).sort());
      for (const key of Object.keys(part.es)) {
        expect(seen.get(key) ?? name).toBe(name);
        seen.set(key, name);
      }
    }
  });

  test("cada archivo que usa una clave de una parte importa esa parte", () => {
    const owner = new Map<string, string>();
    for (const [name, part] of Object.entries(parts)) {
      for (const key of Object.keys(part.es)) owner.set(key, name);
    }
    const missing: string[] = [];
    for (const file of sources(SRC)) {
      if (/lib\/i18n(-[a-z]+)?\.tsx?$/.test(file)) continue;
      const code = readFileSync(file, "utf8");
      // Sin comentarios: uno que cite una clave entre comillas no la usa.
      const live = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const needed = new Set<string>();
      for (const match of live.matchAll(/["'`]([A-Za-z][A-Za-z0-9_]*)["'`]/g)) {
        const part = owner.get(match[1]!);
        if (part) needed.add(part);
      }
      for (const part of needed) {
        if (!code.includes(`"@/lib/i18n-${part}"`)) {
          missing.push(`${relative(SRC, file)} usa claves de i18n-${part} sin importarla`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
