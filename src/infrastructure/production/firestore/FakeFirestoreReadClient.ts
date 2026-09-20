/**
 * Phase 4A-0 — In-memory Fake Firestore read client (tests only).
 * No network. No Production.
 */

import {
  assertCollectionAllowedForRead,
  assertReadQueryLimit,
  isDocumentIdOrderField,
  type FirestoreDocumentSnapshot,
  type FirestoreQueryRequest,
  type FirestoreQueryResult,
  type FirestoreReadClient,
} from "@/infrastructure/production/firestore/FirestoreReadClient";
import { DEFAULT_MAX_PAGE_SIZE } from "@/domain/production-read/constants";

export type FakeFirestoreDoc = {
  id: string;
  data: Record<string, unknown>;
};

/**
 * Mirror Firestore type-aware compare for Fake tests.
 * Timestamp/Date vs ISO string = incomparable (never match range) — same as
 * Production type-E failure when ISO string bounds are passed against Timestamp fields.
 */
function toComparableMillis(v: unknown): number | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.getTime();
  }
  if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (v as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // ISO / parseable string — only comparable to other strings/Dates when both parse.
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

function firestoreTypeRank(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "boolean") return 1;
  if (typeof v === "number") return 2;
  if (
    v instanceof Date ||
    (typeof v === "object" &&
      v &&
      "toDate" in v &&
      typeof (v as { toDate: () => Date }).toDate === "function")
  ) {
    return 3; // timestamp
  }
  if (typeof v === "string") return 4;
  return 5;
}

/** Firestore-like compare: different types never satisfy inequality ranges. */
function compareFirestoreLike(left: unknown, right: unknown): number {
  const lr = firestoreTypeRank(left);
  const rr = firestoreTypeRank(right);
  // String bounds vs Timestamp field → never match (Production zero-result root cause).
  if (lr !== rr && !(lr === 3 && rr === 3)) {
    // Allow Date filter vs ISO string doc only when both resolve to millis AND
    // the filter is Date (corrected path) — Fake seeds often use ISO strings.
    if (rr === 3 && lr === 4) {
      // left is string doc, right is Date filter — comparable after Date fix.
      const lm = toComparableMillis(left);
      const rm = toComparableMillis(right);
      if (lm != null && rm != null) return lm === rm ? 0 : lm < rm ? -1 : 1;
    }
    if (lr === 3 && rr === 4) {
      // left Timestamp doc, right ISO string filter — TYPE MISMATCH, never match.
      return -1; // timestamp < string in Firestore; >= string fails
    }
    if (lr !== rr) return lr < rr ? -1 : 1;
  }
  const lm = toComparableMillis(left);
  const rm = toComparableMillis(right);
  if (lm != null && rm != null) return lm === rm ? 0 : lm < rm ? -1 : 1;
  if (left === right) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (left as any) < (right as any) ? -1 : 1;
}

export class FakeFirestoreReadClient implements FirestoreReadClient {
  private readonly collections = new Map<string, Map<string, Record<string, unknown>>>();
  /** Test observability — query requests issued (no Production). */
  readonly queryLog: FirestoreQueryRequest[] = [];
  /** Test observability — getDocument calls. */
  readonly getLog: Array<{ collection: string; documentId: string }> = [];

  seed(collection: string, docs: FakeFirestoreDoc[]): void {
    assertCollectionAllowedForRead(collection);
    let map = this.collections.get(collection);
    if (!map) {
      map = new Map();
      this.collections.set(collection, map);
    }
    for (const doc of docs) {
      map.set(doc.id, { ...doc.data });
    }
  }

  async getDocument(
    collection: string,
    documentId: string,
  ): Promise<FirestoreDocumentSnapshot> {
    assertCollectionAllowedForRead(collection);
    this.getLog.push({ collection, documentId });
    const map = this.collections.get(collection);
    const data = map?.get(documentId) ?? null;
    return {
      id: documentId,
      exists: data != null,
      data: data ? { ...data } : null,
    };
  }

  async query(request: FirestoreQueryRequest): Promise<FirestoreQueryResult> {
    assertCollectionAllowedForRead(request.collection);
    assertReadQueryLimit(request.limit, DEFAULT_MAX_PAGE_SIZE);
    this.queryLog.push(request);

    const map = this.collections.get(request.collection) ?? new Map();
    let rows: FirestoreDocumentSnapshot[] = [...map.entries()].map(
      ([id, data]) => ({ id, exists: true, data: { ...data } }),
    );

    for (const filter of request.filters ?? []) {
      rows = rows.filter((doc) => {
        const value = doc.data?.[filter.field];
        switch (filter.op) {
          case "==":
            return value === filter.value;
          case "in":
            return Array.isArray(filter.value) && filter.value.includes(value);
          case ">=":
            return compareFirestoreLike(value, filter.value) >= 0;
          case "<=":
            return compareFirestoreLike(value, filter.value) <= 0;
          case ">":
            return compareFirestoreLike(value, filter.value) > 0;
          case "<":
            return compareFirestoreLike(value, filter.value) < 0;
          case "array-contains":
            return Array.isArray(value) && value.includes(filter.value);
          default:
            return false;
        }
      });
    }

    // Mirror Firestore: orderBy(field) also filters for field existence —
    // EXCEPT FieldPath.documentId() / __name__, which always exists.
    for (const order of request.orderBy ?? []) {
      if (isDocumentIdOrderField(order.field)) {
        rows.sort((a, b) => {
          const cmp = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          return order.direction === "asc" ? cmp : -cmp;
        });
        continue;
      }
      rows = rows.filter((doc) => {
        const v = doc.data?.[order.field];
        return v !== undefined && v !== null;
      });
      rows.sort((a, b) => {
        const av = a.data?.[order.field];
        const bv = b.data?.[order.field];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = compareFirestoreLike(av, bv);
        return order.direction === "asc" ? cmp : -cmp;
      });
    }

    if (request.startAfterCursor) {
      const idx = rows.findIndex((r) => r.id === request.startAfterCursor);
      if (idx >= 0) {
        rows = rows.slice(idx + 1);
      }
    }

    const page = rows.slice(0, request.limit);
    const nextCursor =
      rows.length > request.limit ? page[page.length - 1]?.id ?? null : null;

    return { docs: page, nextCursor };
  }

  async count(request: {
    collection: string;
    filters?: FirestoreQueryRequest["filters"];
  }): Promise<number> {
    assertCollectionAllowedForRead(request.collection);
    this.queryLog.push({
      collection: request.collection,
      filters: request.filters,
      orderBy: [],
      limit: 1,
    });
    const map = this.collections.get(request.collection) ?? new Map();
    let rows: FirestoreDocumentSnapshot[] = [...map.entries()].map(
      ([id, data]) => ({ id, exists: true, data: { ...data } }),
    );
    for (const filter of request.filters ?? []) {
      rows = rows.filter((doc) => {
        const value = doc.data?.[filter.field];
        switch (filter.op) {
          case "==":
            return value === filter.value;
          case "in":
            return Array.isArray(filter.value) && filter.value.includes(value);
          case ">=":
            return compareFirestoreLike(value, filter.value) >= 0;
          case "<=":
            return compareFirestoreLike(value, filter.value) <= 0;
          case ">":
            return compareFirestoreLike(value, filter.value) > 0;
          case "<":
            return compareFirestoreLike(value, filter.value) < 0;
          case "array-contains":
            return Array.isArray(value) && value.includes(filter.value);
          default:
            return false;
        }
      });
    }
    return rows.length;
  }
}
