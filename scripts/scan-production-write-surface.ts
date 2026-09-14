/**
 * Static scan: Production infrastructure must not expose Firestore write APIs.
 * Fails if unauthorized Firestore write patterns appear under
 * src/infrastructure/production (prefer zero exceptions).
 *
 * Targets Firestore writes — not Map.set / generic JS.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src/infrastructure/production");

/**
 * Firestore / Admin write surface patterns.
 * Intentionally excludes Map.prototype.set and similar.
 */
const WRITE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "doc().set(", re: /\.doc\s*\([^)]*\)\s*\.set\s*\(/ },
  { name: "doc().update(", re: /\.doc\s*\([^)]*\)\s*\.update\s*\(/ },
  { name: "doc().delete(", re: /\.doc\s*\([^)]*\)\s*\.delete\s*\(/ },
  { name: "ref.set(", re: /\bref\s*\.\s*set\s*\(/ },
  { name: "ref.update(", re: /\bref\s*\.\s*update\s*\(/ },
  { name: "ref.delete(", re: /\bref\s*\.\s*delete\s*\(/ },
  { name: "batch.set(", re: /\bbatch\s*\.\s*set\s*\(/ },
  { name: "batch.update(", re: /\bbatch\s*\.\s*update\s*\(/ },
  { name: "batch.delete(", re: /\bbatch\s*\.\s*delete\s*\(/ },
  { name: "writeBatch(", re: /\bwriteBatch\s*\(/ },
  { name: "runTransaction(", re: /\brunTransaction\s*\(/ },
  { name: "collection().add(", re: /\.collection\s*\([^)]*\)\s*\.add\s*\(/ },
  { name: "create(", re: /\.(?:create)\s*\(\s*\{[^}]*resource:/ },
];

const CREDENTIAL_FILE_RE =
  /(serviceAccount.*\.json|firebase-adminsdk.*\.json)/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

export type ProductionWriteScanResult = {
  ok: boolean;
  violations: Array<{ file: string; pattern: string; line: number }>;
  credentialPathHits: string[];
};

export function scanProductionWriteSurface(
  root: string = ROOT,
): ProductionWriteScanResult {
  const violations: ProductionWriteScanResult["violations"] = [];
  const credentialPathHits: string[] = [];
  const files = walk(root);

  for (const file of files) {
    const rel = relative(process.cwd(), file);
    const content = readFileSync(file, "utf8");

    if (
      /serviceAccount.*\.json['"`]|firebase-adminsdk.*\.json['"`]/.test(content) &&
      /readFileSync|require\s*\(/.test(content)
    ) {
      credentialPathHits.push(rel);
    }

    // DisabledWriteRepository intentionally defines create/update/delete stubs
    if (rel.endsWith("DisabledWriteRepository.ts")) continue;

    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      ) {
        return;
      }
      for (const p of WRITE_PATTERNS) {
        if (p.re.test(line)) {
          violations.push({
            file: rel,
            pattern: p.name,
            line: idx + 1,
          });
        }
      }
    });
  }

  return {
    ok: violations.length === 0 && credentialPathHits.length === 0,
    violations,
    credentialPathHits,
  };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = scanProductionWriteSurface();
  if (!result.ok) {
    console.error("Production write static scan FAILED:");
    for (const v of result.violations) {
      console.error(`  ${v.file}:${v.line} → ${v.pattern}`);
    }
    for (const c of result.credentialPathHits) {
      console.error(`  credential path reference: ${c}`);
    }
    process.exit(1);
  }
  console.log("Production write static scan OK");
}
