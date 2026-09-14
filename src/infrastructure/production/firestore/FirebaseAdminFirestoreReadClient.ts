/**
 * Phase 4A-0 — Firebase Admin Firestore READ-ONLY client.
 * Real code path exists but is NOT invoked against Production in this phase.
 */

import {
  assertCollectionAllowedForRead,
  assertReadQueryLimit,
  isDocumentIdOrderField,
  type FirestoreDocumentSnapshot,
  type FirestoreQueryFilter,
  type FirestoreQueryRequest,
  type FirestoreQueryResult,
  type FirestoreReadClient,
} from "@/infrastructure/production/firestore/FirestoreReadClient";
import { DEFAULT_MAX_PAGE_SIZE } from "@/domain/production-read/constants";
import type { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";

type AdminFirestore = {
  collection: (name: string) => AdminCollectionRef;
};

type AdminCollectionRef = {
  doc: (id: string) => {
    get: () => Promise<{
      id: string;
      exists: boolean;
      data: () => Record<string, unknown> | undefined;
    }>;
  };
};

type AdminQuery = {
  where: (field: string, op: string, value: unknown) => AdminQuery;
  orderBy: (field: unknown, direction: string) => AdminQuery;
  startAfter: (...args: unknown[]) => AdminQuery;
  limit: (n: number) => AdminQuery;
  get: () => Promise<{
    docs: Array<{
      id: string;
      data: () => Record<string, unknown>;
    }>;
  }>;
};

/**
 * Wraps Admin Firestore with a read-only surface.
 * Callers never receive a writable Firestore handle.
 */
export class FirebaseAdminFirestoreReadClient implements FirestoreReadClient {
  constructor(
    private readonly factory: FirebaseAdminFactory,
    private readonly maxPageSize: number = DEFAULT_MAX_PAGE_SIZE,
  ) {}

  async getDocument(
    collection: string,
    documentId: string,
  ): Promise<FirestoreDocumentSnapshot> {
    assertCollectionAllowedForRead(collection);
    const db = await this.getDb();
    const snap = await db.collection(collection).doc(documentId).get();
    return {
      id: snap.id,
      exists: snap.exists,
      data: snap.exists ? (snap.data() as Record<string, unknown>) : null,
    };
  }

  async query(request: FirestoreQueryRequest): Promise<FirestoreQueryResult> {
    assertCollectionAllowedForRead(request.collection);
    assertReadQueryLimit(request.limit, this.maxPageSize);

    const admin = await import("firebase-admin");
    const db = await this.getDb();
    // Start from collection reference then narrow — typed as AdminQuery
    let q = db.collection(request.collection) as unknown as AdminQuery;

    for (const filter of request.filters ?? []) {
      q = applyFilter(q, filter);
    }

    const orderBy = request.orderBy ?? [];
    const documentIdOnlyOrder =
      orderBy.length === 1 && isDocumentIdOrderField(orderBy[0]!.field);

    for (const order of orderBy) {
      if (isDocumentIdOrderField(order.field)) {
        q = q.orderBy(
          admin.firestore.FieldPath.documentId(),
          order.direction,
        );
      } else {
        q = q.orderBy(order.field, order.direction);
      }
    }

    if (request.startAfterCursor) {
      if (documentIdOnlyOrder) {
        // Cursor = lastDocumentId → startAfter(id) with FieldPath.documentId() order.
        q = q.startAfter(request.startAfterCursor);
      } else {
        const cursorDoc = await db
          .collection(request.collection)
          .doc(request.startAfterCursor)
          .get();
        if (cursorDoc.exists) {
          q = q.startAfter(cursorDoc);
        }
      }
    }
    q = q.limit(request.limit);

    const snap = await q.get();
    const docs: FirestoreDocumentSnapshot[] = snap.docs.map((d) => ({
      id: d.id,
      exists: true,
      data: d.data() as Record<string, unknown>,
    }));
    const nextCursor =
      docs.length === request.limit ? docs[docs.length - 1]?.id ?? null : null;
    return { docs, nextCursor };
  }

  private async getDb(): Promise<AdminFirestore> {
    const appHandle = await this.factory.getApp();
    const admin = await import("firebase-admin");
    const app =
      admin.apps.find((a) => a?.name === appHandle.appName) ??
      admin.app(appHandle.appName);
    return admin.firestore(app) as unknown as AdminFirestore;
  }
}

function applyFilter(q: AdminQuery, filter: FirestoreQueryFilter): AdminQuery {
  return q.where(filter.field, filter.op, filter.value);
}
