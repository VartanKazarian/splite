import { describe, expect, test } from "bun:test";

import { cookieSite, refreshViaCookie } from "../src/lib/api";
import { withoutWindow } from "./components/setup";

/**
 * El modo cookie sólo se enciende cuando la página y la API son el mismo
 * sitio. Desde splite.lovable.app la cookie sería de terceros: Safari la
 * descarta y el personal perdería la sesión.
 */
const API = "https://api.splite.lat";

describe("cookieSite", () => {
  test("on splite.lat and its subdomains, with the API on api.splite.lat", () => {
    expect(cookieSite("splite.lat", API)).toBe(true);
    expect(cookieSite("www.splite.lat", API)).toBe(true);
  });

  test("not on lovable.app, localhost, or look-alike domains", () => {
    for (const host of [
      "splite.lovable.app",
      "localhost",
      "evilsplite.lat",
      "splite.lat.evil.com",
    ]) {
      expect(cookieSite(host, API)).toBe(false);
    }
  });

  test("not while the API is still on its Railway address", () => {
    expect(cookieSite("splite.lat", "https://splite-backend-production.up.railway.app")).toBe(
      false,
    );
  });

  test("never during server rendering", () => {
    // Sin `window`, como en el servidor: las pruebas de componentes ponen un
    // DOM para todo el proceso, y en él la página está en splite.lat.
    expect(withoutWindow(() => refreshViaCookie())).toBe(false);
  });
});
