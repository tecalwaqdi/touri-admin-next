import type { AccessScope } from "@/types/roles";
import type { FirestoreReadClient, FirestoreDocumentSnapshot } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { assertDetailResourceInScope } from "./detailScope";
import { enforceReadScope } from "@/infrastructure/production/contracts/ScopeExpansionGuard";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { maskEmail, maskPhone } from "@/domain/pii/maskIdentity";

/** Bounded server-side scope filtering; raw records never reach the browser. */
export function scopedCatalogReadClient(client: FirestoreReadClient, scope: AccessScope): FirestoreReadClient {
  const authority = enforceReadScope({ actorScope: scope });
  if (!authority.ok) throw new ScopeDeniedError(authority.reason);
  function inScope(collection: string, doc: FirestoreDocumentSnapshot): boolean {
    if (!doc.exists || !doc.data) return true;
    // Vehicle types are a shared public catalog, without persona or country data.
    if (collection === "type_car") return true;
    const d = doc.data;
    try {
      assertDetailResourceInScope(scope, {
        countryId: extractLegacyDocRefId(d.countryId ?? d.countryRef ?? d.Rev_dolh ?? d.rev_dolh ?? d.dolh),
        cityId: extractLegacyDocRefId(d.cityId ?? d.cityRef ?? d.vill ?? d.mndob_vill),
        agentId: extractLegacyDocRefId(d.agentId ?? d.agentRef),
      });
      return true;
    } catch (error) {
      if (error instanceof ScopeDeniedError) return false;
      throw error;
    }
  }
  function redact(collection: string, doc: FirestoreDocumentSnapshot): FirestoreDocumentSnapshot {
    if (collection !== "transport_company" || !doc.data) return doc;
    return { ...doc, data: { ...doc.data, phone: maskPhone(typeof doc.data.phone === "string" ? doc.data.phone : null), email: maskEmail(typeof doc.data.email === "string" ? doc.data.email : null) } };
  }
  return {
    async query(request) {
      const page = await client.query(request);
      return { ...page, docs: page.docs.filter(doc => inScope(request.collection, doc)).map(doc => redact(request.collection, doc)) };
    },
    async getDocument(collection, id) {
      if (!id || id.includes("/") || id === "." || id === "..") throw Object.assign(new Error("Invalid resource identifier"), { code: "INVALID_QUERY_LIMIT" });
      const doc = await client.getDocument(collection, id);
      if (!inScope(collection, doc)) throw new ScopeDeniedError("Resource outside authorized scope");
      return redact(collection, doc);
    },
    ...(typeof client.count === "function"
      ? {
          count: (request: Parameters<NonNullable<FirestoreReadClient["count"]>>[0]) =>
            client.count!(request),
        }
      : {}),
  };
}
