/**
 * Phase 3.7 — Standard API error contract.
 * Never leak stack traces, internal paths, Firebase internals, or claims dumps.
 */

export type StandardApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  correlationId: string;
};

const FORBIDDEN_LEAK_PATTERNS = [
  /at\s+\S+\s+\(/i,
  /node_modules/i,
  /firebase-admin/i,
  /service[_-]?account/i,
  /private[_-]?key/i,
  /claims\s*[:=]/i,
  /\/Users\//i,
  /\/home\//i,
  /ECONNREFUSED/i,
];

export function toPublicApiError(input: {
  code: string;
  message: string;
  requestId: string;
  correlationId: string;
  internalDetail?: unknown;
}): StandardApiErrorBody {
  let message = input.message || "Request failed";
  for (const pattern of FORBIDDEN_LEAK_PATTERNS) {
    if (pattern.test(message)) {
      message = "Request failed";
      break;
    }
  }
  // Never serialize internalDetail into response
  void input.internalDetail;
  return {
    code: input.code,
    message,
    requestId: input.requestId,
    correlationId: input.correlationId,
  };
}

export function assertNoSensitiveLeak(body: unknown): boolean {
  const text = JSON.stringify(body);
  return !FORBIDDEN_LEAK_PATTERNS.some((p) => p.test(text));
}
