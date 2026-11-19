/**
 * ¿Los tipos generados son los del contrato guardado? (FR6)
 *
 * Regenera en un archivo aparte y compara. Falla si alguien cambió
 * `contract/openapi.json` sin regenerar, o editó el archivo generado a mano.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "api-types-")), "schema.ts");
execFileSync("npx", ["openapi-typescript", "contract/openapi.json", "-o", tmp], {
  stdio: "ignore",
});
if (fs.readFileSync(tmp, "utf8") !== fs.readFileSync("src/lib/api-schema.gen.ts", "utf8")) {
  console.error(
    "src/lib/api-schema.gen.ts no corresponde a contract/openapi.json: bun run api:types",
  );
  process.exit(1);
}
console.log("Tipos generados al día con contract/openapi.json.");
