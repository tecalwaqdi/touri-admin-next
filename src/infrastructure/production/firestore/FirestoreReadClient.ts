/**
 * Phase 4A-0 — READ-ONLY Firestore client abstraction.
 * Interface exposes reads only — no set/update/delete/create/writeBatch/transaction.
 * Low-level client enforces collection allowlist.
 */

import {
  isCollectionAllowedForProductionRead,
  type AllowedProductionCollection,
} from "@/infrastructure/production/contracts/CollectionAllowlist";

export class CollectionNotAllowedError extends Error {
  readonly code = "COLLECTION_NOT_ALLOWED";
  constructor(readonly collection: string) {
    super(`COLLECTION_NOT_ALLOWED: ${collection}`);
    this.name = "CollectionNotAllowedError";
  }
}

export class QueryNotSupportedError extends Error {
  readonly code = "QUERY_NOT_SUPPORTED";
  constructor(message: string) {
    super(message);
    this.name = "QueryNotSupportedError";
  }
}

export class InvalidQueryLimitError extends Error {
  readonly code = "INVALID_QUERY_LIMIT";
  constructor(message: string) {
    super(message);
    this.name = "InvalidQueryLimitError";
  }
}

export type FirestoreDocumentSnapshot = {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FirestoreQueryFilter =
  | { field: string; op: "==" | "in" | ">=" | "<=" | ">" | "<"; value: unknown }
  | { field: string; op: "array-contains"; value: unknown };

export type FirestoreQueryOrder = {
  field: string;
  direction: "asc" | "desc";
};

/** FieldPath.documentId() / `__name__` order sentinel used by index-free queries. */
export function isDocumentIdOrderField(field: string): boolean {
  return (
    field === "__name__" ||
    field === "FieldPath.documentId()" ||
    field === "documentId"
  );
}

export type FirestoreQueryRequest = {
  collection: AllowedProductionCollection | string;
  filters?: FirestoreQueryFilter[];
  orderBy?: FirestoreQueryOrder[];
  limit: number;
  /** Opaque cursor (document id or encoded startAfter). */
  startAfterCursor?: string | null;
};

export type FirestoreQueryResult = {
  docs: FirestoreDocumentSnapshot[];
  nextCursor: string | null;
};

/**
 * READ-ONLY — intentionally omits write APIs.
 */
export interface FirestoreReadClient {
  getDocument(
    collection: string,
    documentId: string,
  ): Promise<FirestoreDocumentSnapshot>;
  query(request: FirestoreQueryRequest): Promise<FirestoreQueryResult>;
}

export function assertCollectionAllowedForRead(collection: string): void {
  if (!isCollectionAllowedForProductionRead(collection)) {
    throw new CollectionNotAllowedError(collection);
  }
}

export function assertReadQueryLimit(
  limit: number,
  maxPageSize: number,
): void {
  if (!Number.isFinite(limit) || limit <= 0 || limit > maxPageSize) {
    throw new InvalidQueryLimitError(
      `INVALID_QUERY_LIMIT: limit=${limit} max=${maxPageSize}`,
    );
  }
}

/**
 * Index capability checker — Fake only in 4A-0.
 * Unknown index → QUERY_NOT_SUPPORTED (no broad unindexed fallback).
 */
export interface IndexCapabilityChecker {
  assertQuerySupported(input: {
    collection: string;
    filters: FirestoreQueryFilter[];
    orderBy: FirestoreQueryOrder[];
  }): void;
}

export class FakeIndexCapabilityChecker implements IndexCapabilityChecker {
  constructor(
    private readonly supported: Set<string> = new Set([
      "countries::",
      "countries::naim",
      "cities::countryId",
      "villages::",
      "villages::naim",
      "order::createdAt+countryId",
      "order::createdAt",
      "order::data_order",
      "order::",
      "mkan::",
      "mkan::naim",
      "user::country_id",
      "user::is_agent+country_id",
      "user::Isagent",
      "user::Isagent+__name__",
      "user::Isagent+created_time",
      "user::ismndob",
      "user::ismndob+created_time",
    ]),
  ) {}

  private key(input: {
    collection: string;
    filters: FirestoreQueryFilter[];
    orderBy: FirestoreQueryOrder[];
  }): string {
    const fields = [
      ...input.filters.map((f) => f.field),
      ...input.orderBy.map((o) => o.field),
    ];
    const uniq = [...new Set(fields)].sort().join("+");
    return `${input.collection}::${uniq}`;
  }

  assertQuerySupported(input: {
    collection: string;
    filters: FirestoreQueryFilter[];
    orderBy: FirestoreQueryOrder[];
  }): void {
    const k = this.key(input);
    // Equality + orderBy documentId (__name__) needs no composite index.
    const documentIdOnlyOrder =
      input.orderBy.length === 1 &&
      isDocumentIdOrderField(input.orderBy[0]!.field);
    if (documentIdOnlyOrder && input.filters.length >= 1) {
      return;
    }
    // Allow empty filter geography list
    if (
      this.supported.has(k) ||
      this.supported.has(`${input.collection}::`) ||
      input.collection === "countries"
    ) {
      return;
    }
    // Soft-match: if any registered key starts with collection and covers orderBy
    for (const s of this.supported) {
      if (s.startsWith(`${input.collection}::`)) {
        const needed = input.orderBy.map((o) => o.field);
        if (needed.every((f) => s.includes(f))) return;
      }
    }
    throw new QueryNotSupportedError(
      `QUERY_NOT_SUPPORTED: no known index for ${k}`,
    );
  }
}
