import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");
const SCAN_DIRS = ["features", "auth", "lib", "components"] as const;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "test") continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("production browser UI must not emit x-user-id headers", () => {
  it("has no x-user-id setters outside dev-only apiClient branch", () => {
    const offenders: string[] = [];
    for (const scan of SCAN_DIRS) {
      const base = join(ROOT, scan);
      for (const file of collectSourceFiles(base)) {
        if (file.endsWith("apiClient.ts")) continue;
        const text = readFileSync(file, "utf8");
        if (/headers\.set\(\s*["']x-user-id["']/.test(text)) {
          offenders.push(file.replace(`${process.cwd()}/`, ""));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("features use apiClient instead of raw fetch to /api", () => {
    const offenders: string[] = [];
    const featuresDir = join(ROOT, "features");
    for (const file of collectSourceFiles(featuresDir)) {
      const text = readFileSync(file, "utf8");
      if (/fetch\(\s*[`'"]\/api\//.test(text)) {
        offenders.push(file.replace(`${process.cwd()}/`, ""));
      }
    }
    expect(offenders).toEqual([]);
  });
});
