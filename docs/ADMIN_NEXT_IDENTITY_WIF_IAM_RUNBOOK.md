# Admin Next — Identity Admin WIF / IAM Runbook

**Status:** DOCUMENT ONLY — do **not** execute IAM in this phase.
**Project:** `tutorial-multi-language-70gx4j`
**App:** `touri-admin-next` (Vercel Production)
**Related:** `docs/ADMIN_NEXT_IDENTITY_WRITE_SECURITY.md`, `src/application/identity/IdentityAdminIamContract.ts`

---

## Purpose

Enable Production **identity persona writes** (`ADMIN_IDENTITY_WRITE_ENABLED`) via a **dedicated** identity-admin service account bound through Workload Identity Federation (WIF). Auth custom claims remain owned by Cloud Function `syncUserClaimsOnWrite`.

Shadow-reader (`GCP_SERVICE_ACCOUNT_EMAIL`) stays **read-only**.

---

## Service account (exact)

| Item | Value |
|---|---|
| SA id | `touri-admin-next-identity-admin` |
| SA email | `touri-admin-next-identity-admin@tutorial-multi-language-70gx4j.iam.gserviceaccount.com` |
| Display name | Touri Admin Next Identity Admin |
| Env var (Vercel Production) | `GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL` |
| Must differ from | `GCP_SERVICE_ACCOUNT_EMAIL` = `touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com` |

---

## Required APIs (project)

Enable if not already:

- `iam.googleapis.com`
- `iamcredentials.googleapis.com`
- `sts.googleapis.com`
- `firestore.googleapis.com` / `datastore.googleapis.com` (Firestore native)

Do **not** enable unused broad admin APIs for this SA.

---

## Exact least-privilege roles / permissions

Grant **only** on the identity-admin SA:

1. **Token minting for WIF principals (required)**
   - Binding: allow the WIF pool principal set to call
     `iam.serviceAccounts.getAccessToken` **on this SA only**
   - Typical role: `roles/iam.workloadIdentityUser` on the SA resource
     (not project-wide Editor)

2. **Firestore persona patch (narrow)**
   - Intended permission: `datastore.entities.update`
   - Scope: collection `user` / document `{uid}` **allowlisted persona fields only**
     (role, scope, active/disabled flags as coded in identity write path)
   - Prefer a custom role or IAM Conditions limiting resource name to
     `projects/tutorial-multi-language-70gx4j/databases/(default)/documents/user/*`
   - If Conditions cannot be applied yet: still **never** grant Editor/Owner; use the
     narrowest available Datastore user role and keep hard app allowlists.

3. **Explicitly do NOT grant Auth Admin**
   - No `firebaseauth.admin` / `roles/firebase.admin` on identity-admin
   - Claims mutation remains CF runtime SA via `syncUserClaimsOnWrite`

---

## Exact WIF provider / principal restriction

Reuse the **same WIF pool pattern** as shadow-reader, with a **separate** attribute condition restricting impersonation of identity-admin to Production Vercel only.

| Item | Requirement |
|---|---|
| Provider | Existing GCP WIF OIDC provider for Vercel (same pool family as shadow-reader) |
| Attribute condition (mandatory) | Restrict to Vercel **Production** project `touri-admin-next` only |
| Example condition shape | `assertion.project_id == "<vercel_project_id_for_touri-admin-next>" && assertion.environment == "production"` |
| Principal set | WIF principal that maps to identity-admin SA via `roles/iam.workloadIdentityUser` |

**Do not** allow Preview / Development Vercel environments to impersonate identity-admin.

Vercel Production env:

```bash
GCP_WORKLOAD_IDENTITY_PROVIDER=<same provider resource name pattern as shadow-reader>
GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL=touri-admin-next-identity-admin@tutorial-multi-language-70gx4j.iam.gserviceaccount.com
# Keep shadow-reader separate:
GCP_SERVICE_ACCOUNT_EMAIL=touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com
```

---

## What NOT to grant

- No **Owner** (`roles/owner`)
- No **Editor** (`roles/editor`)
- No **Firebase Admin** (`roles/firebase.admin`)
- No SA JSON key download / upload
- No Application Default Credentials write runtime
- No `GOOGLE_APPLICATION_CREDENTIALS` on Vercel
- No `roles/iam.serviceAccountUser` on unrelated SAs
- No Auth `setCustomUserClaims` from Admin Next runtime
- Do not reuse shadow-reader for writes

---

## Verification commands (operator — after IAM, still before arming gate)

```bash
# Confirm SA exists (no key listed)
gcloud iam service-accounts describe \
  touri-admin-next-identity-admin@tutorial-multi-language-70gx4j.iam.gserviceaccount.com

# Confirm no user-managed keys
gcloud iam service-accounts keys list \
  --iam-account=touri-admin-next-identity-admin@tutorial-multi-language-70gx4j.iam.gserviceaccount.com

# Negative: shadow-reader must fail a write probe (operator script / Fake harness)
# Positive: WIF from Vercel Production can mint token for identity-admin only
```

App-level proof before arming:

1. Offline Fake identity write suite green
2. Production call with gates FALSE still returns `403 WRITE_DISABLED`
3. Shadow-reader cannot apply persona patch (IAM deny)
4. After temporary synthetic pilot arm: audit INTENT+RESULT present; claims via CF only

---

## Rollback commands

```bash
# Remove WIF principal binding from identity-admin SA
gcloud iam service-accounts remove-iam-policy-binding \
  touri-admin-next-identity-admin@tutorial-multi-language-70gx4j.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member='principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/attribute. conditional...'

# Unset Vercel Production secret
# GCP_IDENTITY_ADMIN_SERVICE_ACCOUNT_EMAIL (remove)

# Keep gate false
ADMIN_IDENTITY_WRITE_ENABLED=false
```

Disable SA if compromise suspected:

```bash
gcloud iam service-accounts disable \
  touri-admin-next-identity-admin@tutorial-multi-language-70gx4j.iam.gserviceaccount.com
```

---

## Arming order (later phase — not this document’s execution)

1. IAM + WIF verified
2. Synthetic identity pilot
3. Set `ADMIN_IDENTITY_WRITE_ENABLED=true` only with GLOBAL ∧ PRODUCTION_WRITE also approved
4. Observe audit + claims reconciliation
5. Keep `IDENTITY_WRITE_PRODUCTION_HARD_FALSE` policy until operator flips hard lock in code release

**This phase: IAM NOT executed.**
