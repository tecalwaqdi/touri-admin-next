import { CanonicalDriverReviewError } from "@/application/drivers/CanonicalDriverReview";
import { createVercelOidcWifFirebaseCredential, type FirebaseAdminAccessTokenCredential } from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import type { DriverReviewRequestBindingPort } from "./CanonicalDriverReviewRepository";

const PROJECT = "tutorial-multi-language-70gx4j";
export const DRIVER_REVIEW_BINDING_SA = `touri-admin-next-driver-review@${PROJECT}.iam.gserviceaccount.com`;
const COLLECTION_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/admin_next_driver_review_requests`;

/** Dedicated WIF credential, immutable request bindings only. Reader privileges stay unchanged. */
export class WifDriverReviewRequestBindings implements DriverReviewRequestBindingPort {
  private readonly credential: FirebaseAdminAccessTokenCredential;
  constructor(env: NodeJS.ProcessEnv = process.env, private readonly fetcher: typeof fetch = fetch, credential?: FirebaseAdminAccessTokenCredential) {
    if (env.EXPECTED_PROJECT_ID !== PROJECT || !env.GCP_WORKLOAD_IDENTITY_PROVIDER || env.DRIVER_REVIEW_SERVICE_ACCOUNT_EMAIL !== DRIVER_REVIEW_BINDING_SA || env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new CanonicalDriverReviewError("WRITE_RUNTIME_UNAVAILABLE", 503);
    }
    this.credential = credential ?? createVercelOidcWifFirebaseCredential({ workloadIdentityProvider: env.GCP_WORKLOAD_IDENTITY_PROVIDER, serviceAccountEmail: DRIVER_REVIEW_BINDING_SA });
  }
  async bind(key: string, fingerprint: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new CanonicalDriverReviewError("VALIDATION_FAILED", 400);
    try {
      const token = await this.credential.getAccessToken();
      const headers = { Authorization: `Bearer ${token.access_token}`, "content-type": "application/json" };
      const response = await this.fetcher(`${COLLECTION_URL}?documentId=${key}`, {
        method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ fields: { fingerprint: { stringValue: fingerprint }, createdAt: { timestampValue: new Date().toISOString() }, workflow: { stringValue: "reviewDriverApplicationV2" } } }),
      });
      if (response.ok) return;
      if (response.status !== 409) throw new CanonicalDriverReviewError("WRITE_RUNTIME_UNAVAILABLE", 503);
      const existing = await this.fetcher(`${COLLECTION_URL}/${key}`, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!existing.ok) throw new CanonicalDriverReviewError("WRITE_RUNTIME_UNAVAILABLE", 503);
      const stored = await existing.json();
      if (stored.fields?.fingerprint?.stringValue !== fingerprint || stored.fields?.workflow?.stringValue !== "reviewDriverApplicationV2") throw new CanonicalDriverReviewError("IDEMPOTENCY_CONFLICT", 409);
    } catch (error) {
      if (error instanceof CanonicalDriverReviewError) throw error;
      throw new CanonicalDriverReviewError("WRITE_RUNTIME_UNAVAILABLE", 503);
    }
  }
}
