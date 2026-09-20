/**
 * Shared WIF-native FirestoreReadClient.
 * Wraps Fr7WifNativeFirestoreReadTransport — allowlisted, limit≤50, reads only.
 * Replaces FirebaseAdminFirestoreReadClient for Vercel Production API paths.
 */

import {
  assertCollectionAllowedForRead,
  assertReadQueryLimit,
  type FirestoreCountRequest,
  type FirestoreDocumentSnapshot,
  type FirestoreQueryRequest,
  type FirestoreQueryResult,
  type FirestoreReadClient,
} from "@/infrastructure/production/firestore/FirestoreReadClient";
import {
  Fr7WifNativeFirestoreReadTransport,
  WIF_NATIVE_MAX_READ_LIMIT,
  type Fr7FirestoreReadRpcClient,
} from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import type { GoogleAuth } from "google-auth-library";

export type WifNativeFirestoreReadClientOptions = {
  projectId: string;
  auth?: GoogleAuth;
  /** Test injection — skips network. */
  rpcClient?: Fr7FirestoreReadRpcClient;
  maxPageSize?: number;
};

export class WifNativeFirestoreReadClient implements FirestoreReadClient {
  private readonly transport: Fr7WifNativeFirestoreReadTransport;
  private readonly maxPageSize: number;

  constructor(options: WifNativeFirestoreReadClientOptions) {
    this.maxPageSize = Math.min(
      options.maxPageSize ?? WIF_NATIVE_MAX_READ_LIMIT,
      WIF_NATIVE_MAX_READ_LIMIT,
    );
    this.transport = new Fr7WifNativeFirestoreReadTransport({
      projectId: options.projectId,
      auth: options.auth,
      rpcClient: options.rpcClient,
    });
  }

  /** Exposed for tests — prove zero write RPC surface on the shared transport. */
  getTransportForTests(): Fr7WifNativeFirestoreReadTransport {
    return this.transport;
  }

  async getDocument(
    collection: string,
    documentId: string,
  ): Promise<FirestoreDocumentSnapshot> {
    assertCollectionAllowedForRead(collection);
    return this.transport.getDocument(collection, documentId);
  }

  async query(request: FirestoreQueryRequest): Promise<FirestoreQueryResult> {
    assertCollectionAllowedForRead(request.collection);
    assertReadQueryLimit(request.limit, this.maxPageSize);
    return this.transport.query({
      ...request,
      limit: Math.min(request.limit, this.maxPageSize),
    });
  }

  async count(request: FirestoreCountRequest): Promise<number> {
    assertCollectionAllowedForRead(request.collection);
    return this.transport.count({
      collection: request.collection,
      filters: request.filters,
    });
  }
}
