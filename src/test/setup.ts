import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { resetEnvCache } from "@/config/env";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
} from "@/test/helpers/operatorHarnessEnvPreservation";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memory = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  value: memory,
  configurable: true,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: memory,
    configurable: true,
  });
}

/**
 * Capture approved operator harness flags at setup module load — BEFORE any
 * beforeEach sanitization and before live test modules evaluate gates.
 * Same mechanism as Phase 5G live inventory flag preservation.
 * Restores ONLY preserve-list keys; never restores write-arming flags.
 */
const PRESERVED_OPERATOR_HARNESS_ENV = captureOperatorHarnessEnv();

beforeEach(() => {
  memory.clear();
  resetEnvCache();
  process.env.APP_ENV = "development";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.EXPECTED_PROJECT_ID = "";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";

  // Clear never-preserve write arms; restore ONLY approved operator harness flags.
  applyOperatorHarnessEnvSanitization(PRESERVED_OPERATOR_HARNESS_ENV);
});
