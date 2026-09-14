type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /credential/i,
];

function sanitizeValue(key: string, value: unknown): unknown {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(key))) {
    return "[REDACTED]";
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, sanitizeValue(key, value)]),
  );
}

export const logger = {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const payload = {
      level,
      message,
      meta: sanitizeMeta(meta),
      at: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console -- structured logger sink
    const sink = level === "debug" ? console.log : console[level];
    sink(JSON.stringify(payload));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    this.log("debug", message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    this.log("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    this.log("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    this.log("error", message, meta);
  },
};

export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (/secret|password|token|credential/i.test(error.message)) {
      return "An unexpected error occurred";
    }
    return error.message;
  }
  return "An unexpected error occurred";
}
