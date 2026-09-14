/**
 * Phase 3.7 — Canonical Timestamp Mapper.
 * Internal: UTC ISO string. Display: timezone-aware.
 * Unprovable → null + warning. No invented epochs.
 */

export type TimestampMappingResult = {
  utcIso: string | null;
  sourceKind:
    | "firestore_timestamp"
    | "iso_string"
    | "epoch_ms"
    | "epoch_seconds"
    | "unknown"
    | "null";
  confidence: "high" | "medium" | "low" | "unknown";
  warnings: string[];
};

type FirestoreLikeTimestamp = {
  seconds?: number;
  nanoseconds?: number;
  _seconds?: number;
  _nanoseconds?: number;
  toDate?: () => Date;
};

function isFirestoreLike(value: unknown): value is FirestoreLikeTimestamp {
  if (!value || typeof value !== "object") return false;
  const v = value as FirestoreLikeTimestamp;
  return (
    typeof v.toDate === "function" ||
    typeof v.seconds === "number" ||
    typeof v._seconds === "number"
  );
}

/**
 * Map Legacy timestamps carefully.
 * seconds vs ms: values < 1e12 treated as seconds when numeric.
 */
export function mapCanonicalTimestamp(
  raw: unknown,
  options: { assumeLocalUnlabeled?: boolean } = {},
): TimestampMappingResult {
  if (raw == null || raw === "") {
    return {
      utcIso: null,
      sourceKind: "null",
      confidence: "unknown",
      warnings: ["Timestamp missing"],
    };
  }

  if (isFirestoreLike(raw)) {
    try {
      if (typeof raw.toDate === "function") {
        const d = raw.toDate();
        if (!Number.isNaN(d.getTime())) {
          return {
            utcIso: d.toISOString(),
            sourceKind: "firestore_timestamp",
            confidence: "high",
            warnings: [],
          };
        }
      }
      const seconds = raw.seconds ?? raw._seconds;
      if (typeof seconds === "number") {
        const nanos = raw.nanoseconds ?? raw._nanoseconds ?? 0;
        const ms = seconds * 1000 + Math.floor(nanos / 1e6);
        return {
          utcIso: new Date(ms).toISOString(),
          sourceKind: "firestore_timestamp",
          confidence: "high",
          warnings: [],
        };
      }
    } catch {
      return {
        utcIso: null,
        sourceKind: "firestore_timestamp",
        confidence: "unknown",
        warnings: ["Firestore timestamp conversion failed"],
      };
    }
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const abs = Math.abs(raw);
    if (abs < 1e11) {
      // seconds
      return {
        utcIso: new Date(raw * 1000).toISOString(),
        sourceKind: "epoch_seconds",
        confidence: "medium",
        warnings: ["Interpreted numeric timestamp as seconds"],
      };
    }
    return {
      utcIso: new Date(raw).toISOString(),
      sourceKind: "epoch_ms",
      confidence: "high",
      warnings: [],
    };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // Pure digits
    if (/^\d+$/.test(trimmed)) {
      return mapCanonicalTimestamp(Number(trimmed), options);
    }
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) {
      return {
        utcIso: null,
        sourceKind: "unknown",
        confidence: "unknown",
        warnings: [`Unparseable timestamp string: ${trimmed.slice(0, 40)}`],
      };
    }
    if (!hasTz && options.assumeLocalUnlabeled) {
      return {
        utcIso: null,
        sourceKind: "iso_string",
        confidence: "unknown",
        warnings: [
          "Unlabeled local datetime — refuse to invent timezone (null)",
        ],
      };
    }
    if (!hasTz) {
      return {
        utcIso: d.toISOString(),
        sourceKind: "iso_string",
        confidence: "low",
        warnings: [
          "ISO string lacked timezone; interpreted via Date (low confidence)",
        ],
      };
    }
    return {
      utcIso: d.toISOString(),
      sourceKind: "iso_string",
      confidence: "high",
      warnings: [],
    };
  }

  return {
    utcIso: null,
    sourceKind: "unknown",
    confidence: "unknown",
    warnings: ["Unsupported timestamp type"],
  };
}

export function formatTimestampForDisplay(
  utcIso: string | null,
  timeZone: string,
): string | null {
  if (!utcIso) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(utcIso));
  } catch {
    return utcIso;
  }
}
