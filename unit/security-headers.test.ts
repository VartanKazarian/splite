import { describe, expect, test } from "bun:test";

import { securityHeaders, withSecurityHeaders } from "../src/lib/security-headers";

const API = "https://splite-backend-production.up.railway.app/api/v1";

function directive(csp: string, name: string): string[] {
  const found = csp.split("; ").find((part) => part.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

describe("securityHeaders", () => {
  const csp = securityHeaders(API)["Content-Security-Policy"] ?? "";

  test("los datos sólo pueden salir hacia la propia web y la API", () => {
    expect(directive(csp, "connect-src")).toEqual([
      "'self'",
      "https://splite-backend-production.up.railway.app",
    ]);
    expect(directive(csp, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://splite-backend-production.up.railway.app",
    ]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  test("otra web no puede meter el panel en un marco", () => {
    const ancestors = directive(csp, "frame-ancestors");
    expect(ancestors[0]).toBe("'self'");
    expect(ancestors.every((source) => source === "'self'" || source.includes("lovable."))).toBe(
      true,
    );
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
  });

  test("una API mal escrita no abre la puerta a cualquier origen", () => {
    const broken = securityHeaders("no es una url")["Content-Security-Policy"] ?? "";
    expect(directive(broken, "connect-src")).toEqual(["'self'"]);
    expect(broken).not.toContain("*;");
  });

  test("lleva el resto de cabeceras", () => {
    const headers = securityHeaders(API);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});

describe("withSecurityHeaders", () => {
  test("se aplican a las páginas", async () => {
    const page = new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const out = withSecurityHeaders(page, API);
    expect(out.headers.get("content-security-policy")).toContain("connect-src");
    expect(out.status).toBe(200);
    expect(await out.text()).toBe("<html></html>");
  });

  test("lo que no es una página sale como vino", () => {
    const asset = new Response("{}", { headers: { "content-type": "application/json" } });
    expect(withSecurityHeaders(asset, API)).toBe(asset);
  });

  test("no pisa una cabecera que ya puso otro", () => {
    const page = new Response("", {
      headers: { "content-type": "text/html", "x-content-type-options": "otra" },
    });
    expect(withSecurityHeaders(page, API).headers.get("x-content-type-options")).toBe("otra");
  });
});
