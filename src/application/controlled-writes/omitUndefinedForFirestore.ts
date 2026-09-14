/**
 * Firestore Admin SDK rejects `undefined` field values unless
 * `ignoreUndefinedProperties` is enabled. Prefer omitting optional fields
 * over enabling that global setting.
 */

export function omitUndefinedFields<T extends Record<string, unknown>>(
  input: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/**
 * Deep omit for nested plain objects (idempotency `result`, audit payloads).
 * Leaves non-plain objects (Date, Timestamp, FieldValue) untouched.
 */
export function omitUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item));
  }
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (nested === undefined) continue;
    out[key] = omitUndefinedDeep(nested);
  }
  return out;
}

/** Simulates Admin SDK rejection of undefined document fields (offline). */
export function assertFirestoreDocumentHasNoUndefined(
  data: Record<string, unknown>,
  path = "",
): void {
  for (const [key, value] of Object.entries(data)) {
    const field = path ? `${path}.${key}` : key;
    if (value === undefined) {
      throw new Error(
        `Value for argument "data" is not a valid Firestore document. ` +
          `Cannot use "undefined" as a Firestore value (found in field "${field}"). ` +
          `If you want to ignore undefined values, enable \`ignoreUndefinedProperties\`.`,
      );
    }
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === "[object Object]"
    ) {
      assertFirestoreDocumentHasNoUndefined(
        value as Record<string, unknown>,
        field,
      );
    }
  }
}
