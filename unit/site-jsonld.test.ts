import { describe, expect, test } from "bun:test";

import { jsonLd, landingStructuredData } from "@/lib/site";

describe("datos estructurados de la portada", () => {
  test("organización, sitio y aplicación, en Venezuela y sin precio inventado", () => {
    const data = landingStructuredData("Descripción");
    const types = data["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
    const text = JSON.stringify(data);
    expect(text).toContain("Venezuela");
    expect(text).not.toContain("offers");
    expect(text).not.toContain("aggregateRating");
  });

  test("un «</script>» en el texto no cierra la etiqueta", () => {
    const block = jsonLd({ description: "</script><script>alert(1)</script>" });
    expect(block.type).toBe("application/ld+json");
    expect(block.children).not.toContain("</script>");
    expect(JSON.parse(block.children).description).toBe("</script><script>alert(1)</script>");
  });
});
