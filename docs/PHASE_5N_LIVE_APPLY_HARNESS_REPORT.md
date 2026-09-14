# Phase 5N — Live Metadata Reconcile Apply Harness Report

**Date:** 2026-09-13  
**Workspace:** `/Users/ventura/touri-admin-next`  
**Mode:** IMPLEMENT apply path ONLY  
**Production reconciliation executed:** **NO**  
**Production writes this session:** **0**  
**IAM grants this session:** **0**  
**RequestDriverChangesCommand:** **NOT called**  
**Driver / Auth / Finance / Trip / Agent / Customer writes:** **0**

---

## Executive verdict

Operator-controlled live apply path for Phase 5N metadata reconciliation is implemented, gated, offline-proven, and **not executed** against Production.

Authoritative dry-run remains **GO** for exactly **2** metadata writes:

1. create-only success `AUDIT_RESULT` (`outcome=applied`, `code` omitted)
2. `set(merge)` on `admin_next_cw_idempotency/phase5l_driver_needs_changes_pilot_v1` patching **only** `result.auditResultId`

**GO/NO-GO for one operator live reconcile:** **CONDITIONAL GO** — after confirming ADC has the exact IAM below; then arm the harness once. Do not grant IAM in this session; do not auto-rerun.

---

## Exact live command

```bash
PHASE5N_METADATA_RECONCILE_APPLY=1 \
GLOBAL_PRODUCTION_WRITE_ENABLED=true \
PRODUCTION_WRITE_ENABLED=true \
DRIVER_WRITE_ENABLED=false \
AGENT_WRITE_ENABLED=false \
CUSTOMER_WRITE_ENABLED=false \
CUSTOMER_AUTH_WRITE_ENABLED=false \
FINANCE_WRITE_ENABLED=false \
SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED=false \
EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  npx vitest run src/test/live/phase5n-metadata-reconcile-apply.test.ts
```

Notes:

- `DRIVER_WRITE_ENABLED` **must be `false`** (metadata-only; domain forbidden).
- `PHASE5M_DRIVER_PILOT_APPLY` must **not** be `1`.
- Unset `GOOGLE_APPLICATION_CREDENTIALS` (ADC only; no SA JSON).
- Default without `PHASE5N_METADATA_RECONCILE_APPLY=1`: **SKIP**, writes=0.

Safe summary artifact (when run): `.local/phase5n-reconciliation/apply-safe-summary.json`  
Success status: `PHASE5N_METADATA_RECONCILE_PASS`

---

## Exact required IAM permissions (operator ADC)

Derived from Phase 5N metadata-only adapters (`Phase5NIamDerivation.ts`):

| Permission | Why |
| --- | --- |
| `datastore.entities.get` | Precondition re-read + post-verify (user / audit / idempotency) |
| `datastore.entities.create` | create-only success `admin_next_cw_audit/{id}` |
| `datastore.entities.update` | idempotency `set(merge)` of `result.auditResultId` |
| `firebaseauth.users.get` | Auth meta read in observed snapshot (read-only) |

**Not required / must not be used on this path:**

- `firebaseauth.users.update` / `firebaseauth.users.create`
- Driver domain `user/{uid}` update (no `DRIVER_WRITE_ENABLED`)

---

## Exact ADC principal expected

| Field | Value |
| --- | --- |
| Credential kind | Application Default Credentials only |
| User account (gcloud) | `info@touri-taxi.com` |
| SA JSON keys | **Forbidden** (`GOOGLE_APPLICATION_CREDENTIALS` must be unset) |
| Named Admin app | `phase5n-metadata-reconcile-apply` |
| Project | `tutorial-multi-language-70gx4j` |
| Database | `(default)` |

If live Firestore RPCs return `PERMISSION_DENIED`, grant the four permissions above to the **exact ADC principal** that Admin SDK uses (user and/or impersonated SA binding) — **not done this session**.

---

## Apply behavior (implemented)

| Step | Behavior |
| --- | --- |
| Gate | `PHASE5N_METADATA_RECONCILE_APPLY=1` + production write flags; `DRIVER_WRITE_ENABLED=false` |
| Before write | Re-read Production; planner must GO; else `applyAttempted=false`, writes=0, NO-GO |
| Write 1 | create-only success RESULT; omit `code`; no `ignoreUndefinedProperties` |
| Write 2 | `set(merge)` **only** `{ result: { auditResultId } }` |
| Rerun-safe | Already complete → `PHASE5N_METADATA_RECONCILE_ALREADY_RECONCILED`, 0 writes; never second success RESULT; never overwrite conflicting `auditResultId` |
| Success counters | creates=1, patches=1, metadata=2, all forbidden=0 |
| Post-verify | RESULT + idempotency + Driver still `needs_changes` |

---

## Deliverables

| Artifact | Path |
| --- | --- |
| Apply orchestrator | `Phase5NMetadataReconciliationApply.ts` |
| Apply safe summary (§13) | `Phase5NApplySafeSummary.ts` |
| Operator gates | `Phase5NOperatorGates.ts` |
| Narrow write ports / counters | `Phase5NApplyPorts.ts` |
| Production write adapters | `Phase5NProductionMetadataWriteAdapters.ts` |
| Fake ports | `Phase5NFakePorts.ts` |
| IAM derivation | `Phase5NIamDerivation.ts` |
| Live env helper | `src/test/helpers/phase5nOperatorLiveEnv.ts` |
| Env preserve | `PHASE5N_METADATA_RECONCILE_APPLY` (+ dry-run) in `operatorHarnessEnvPreservation.ts` |
| Live harness | `src/test/live/phase5n-metadata-reconcile-apply.test.ts` |
| Offline unit tests | `src/test/unit/phase5n-metadata-reconcile-apply.test.ts` |

Preparation stub remains refuse-only: `Phase5NMetadataReconciliationApplyStub.ts` / apply-stub harness.

---

## Validation (this session)

| Command | Result | Production writes |
| --- | --- | --- |
| Targeted Phase 5N tests | **PASS** — 24/24 | 0 |
| `npm test` | **PASS** — 1066 passed, 2 skipped | 0 |
| `npm run typecheck` | **PASS** | 0 |
| `npm run build` | **PASS** | 0 |
| Live apply (`PHASE5N_METADATA_RECONCILE_APPLY=1`) | **NOT RUN** | 0 |

---

## STOP

Implementation complete. **Do not** execute Production metadata reconcile until an explicitly authorized armed session with confirmed IAM on the ADC principal above.
