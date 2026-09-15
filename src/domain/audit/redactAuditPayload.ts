/**
 * PC-4 — Redact secrets/tokens/credentials from audit payloads before UI.
 */

const SECRET_KEY =
  /password|secret|token|credential|authorization|api[_-]?key|private[_-]?key|refresh|id[_-]?token|access[_-]?token|session/i;

export function redactAuditValue(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (Array.isArray(value)) {
    return value.map((v, i) => redactAuditValue(String(i), v));
  }
  if (value && typeof value === "object") {
    return redactAuditRecord(value as Record<string, unknown>);
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 200)}…[truncated]`;
  }
  return value;
}

export function redactAuditRecord(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (input == null) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = redactAuditValue(k, v);
  }
  return out;
}

export function redactAuditJson(value: unknown): unknown {
  if (value == null) return value;
  try {
    const serialized = JSON.stringify(value, (key, v) => {
      if (key && SECRET_KEY.test(key)) return "[redacted]";
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "function" || typeof v === "symbol") return undefined;
      return v;
    });
    // JSON.stringify(undefined) → undefined (not a string) — treat as absent.
    if (serialized == null) return null;
    return JSON.parse(serialized);
  } catch {
    // Malformed / circular payloads must not crash the audit list.
    return { _redaction: "unavailable_malformed_payload" };
  }
}
