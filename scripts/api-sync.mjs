/**
 * Trae el contrato del backend y regenera los tipos (FR6).
 *
 *   bun run api:sync              # desde ../splite-backend
 *   bun run api:sync ruta/al/repo # desde otro sitio (CI: .api)
 *
 * Copia `openapi.json` a `contract/`, regenera `src/lib/api-schema.gen.ts`, y
 * `bun run typecheck` dice entonces qué tipo de `api.ts` se quedó atrás
 * (`src/lib/api-contract.ts`).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const backend = path.resolve(process.argv[2] ?? "../splite-backend");
const source = path.join(backend, "openapi.json");
if (!fs.existsSync(source)) {
  console.error(`No está ${source}. Pasa la ruta del repositorio del backend.`);
  process.exit(1);
}
fs.mkdirSync("contract", { recursive: true });
fs.copyFileSync(source, "contract/openapi.json");
execFileSync(
  "npx",
  ["openapi-typescript", "contract/openapi.json", "-o", "src/lib/api-schema.gen.ts"],
  {
    stdio: "inherit",
  },
);
console.log("Contrato copiado y tipos regenerados. Ahora: bun run typecheck");
