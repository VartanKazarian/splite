import { afterEach, describe, expect, test } from "bun:test";

import { browserLang } from "@/lib/stored-lang";

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function phone(languages: string[]) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { languages, language: languages[0] },
  });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
});

describe("browserLang: el idioma de la mesa para quien no ha elegido", () => {
  test("un teléfono en español, de cualquier país", () => {
    phone(["es-VE"]);
    expect(browserLang()).toBe("es");
    phone(["es"]);
    expect(browserLang()).toBe("es");
  });

  test("español como segundo idioma también es español", () => {
    phone(["en-US", "es-419"]);
    expect(browserLang()).toBe("es");
  });

  test("cualquier otro idioma, inglés", () => {
    phone(["en-GB"]);
    expect(browserLang()).toBe("en");
    phone(["de-DE", "fr"]);
    expect(browserLang()).toBe("en");
  });

  test("sin navegador que preguntar, español", () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined });
    expect(browserLang()).toBe("es");
  });
});
