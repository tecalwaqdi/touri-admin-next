function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for constrained test environments
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createCorrelationId(): string {
  return `corr_${uuid()}`;
}

export function createRequestId(): string {
  return `req_${uuid()}`;
}

export function createIdempotencyKey(prefix = "idem"): string {
  return `${prefix}_${uuid()}`;
}

export function createAuditId(): string {
  return `audit_${uuid()}`;
}
