# TOURI TAXI ADMIN NEXT — PHASE 5I AUTH-SAFE SYNTHETIC DRIVER PROVISIONING REPORT

**Date:** 2026-09-13  
**Phase:** 5I Auth-Safe Synthetic Driver Fixture Provisioning Design  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** DESIGN + OFFLINE VALIDATION ONLY  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**Finance writes this session:** **0**  
**Trip writes this session:** **0**  
**Auth user created:** **NO**  
**Firestore fixture created:** **NO**  
**Write flags enabled:** **NO**  
**Pilot executed:** **NO**  
**Finance started:** **NO**

---

## Context

`EXISTING_APPROVED_SYNTHETIC_PILOT=NO_GO` (Phase 5H pivot): Production `syncUserClaimsOnWrite` always calls `setCustomUserClaims` on every `user/{uid}` create/update. Firestore-only fixtures are incompatible. Phase 5H dedicated fixture path was `FIXTURE_CREATION_NO_GO` because Auth create was forbidden.

Phase 5I designs the **Auth-safe** path:

```text
Dedicated Firebase Auth synthetic user
  → same UID
  → user/{uid} synthetic Driver
  → syncUserClaimsOnWrite runs normally
  → claims only on that synthetic Auth identity
```

**Hard rules honored:** Do NOT bypass/disable `syncUserClaimsOnWrite`. Do NOT modify Production trigger for Pilot ease. Never reuse real Admin/Driver/Customer/Agent UIDs. Prefer Auth UID === Firestore doc ID.

---

## Auth fixture model / UID strategy / disabled feasibility

### Auth create model

| Property | Value |
|---|---|
| `disabled` | `true` (preferred) |
| `email` | omitted |
| `phoneNumber` | omitted |
| `password` | omitted (not preferred) |
| `uid` | omitted → Auth-generated |

**Email requirement (proved from code):**

- `firebase-admin` `CreateRequest.email?: string` — **optional**
- Legacy `createPanelUser` → `createUser({email, password})` — email **required on that path only**
- Phase 5I **does not** call `createPanelUser` → reserved non-deliverable email **not required**
- Real email / phone / OTP: **forbidden**

**Password:** Admin SDK does not require password. If ever forced: random ephemeral, never display / persist / login.

### UID strategy

- Prefer **Auth-generated** UID
- Firestore `user/{uid}` doc id **===** Auth UID
- Forbid orphan non-Auth ids / random IDs / reuse of real personas
- Synthetic classification via Firestore markers (`is_test`, `functional_test`, `qa_fixture`) — **not** ID prefix alone (Auth UIDs lack `test_` prefix)

### Disabled feasibility

| Check | Result |
|---|---|
| `setCustomUserClaims` on disabled user | Compatible (Admin API; trigger does not check `disabled`) |
| Client sign-in | Blocked (`auth/user-disabled`) — desired |
| Membership / Pilot eligibility | Firestore-field driven — Auth disabled irrelevant |
| Future `needs_changes` Pilot | Firestore-domain only |

Code: `Phase5IAuthFixtureModel.ts`

---

## Firestore schema / membership / synthetic classification

**Typed type:** `Phase5ISyntheticDriverFirestoreDoc` (not `Record`)

| Field | Value |
|---|---|
| `ismndob` | `true` |
| `registration_status` | `pending_review` |
| `actev_mndob` | `false` |
| `is_test` / `functional_test` / `qa_fixture` | `true` |
| `on_trip` / `mndon_newacc` / `is_online` | `false` |
| `Rev_dolh` | `countries/saudi_arabia` (mapped) |
| `mndob_vill` | `villages/city_sa_riyadh` (mapped) |

**Role exclusion offline result:**

```text
authoritativeRole = DRIVER (report: driver)
operationalDriver = true
synthetic = true
safePilotEligible = true
plannedAction = needs_changes
```

Auth-shaped UID without `test_` prefix still proves synthetic via markers.

Code: `Phase5ISyntheticDriverFirestoreSchema.ts`

---

## syncUserClaimsOnWrite exact effect / expected claims / elevated-privilege

**Evidence (READ ONLY ara-ban):**

- `admin/Admi/firebase/functions/index.js` — `syncUserClaimsOnWrite` on `user/{uid}` onWrite when `after.exists` → `syncClaimsForUid` → `deriveClaimsFromUserData` → `setCustomUserClaims(uid, claims)`
- `panel_claims.js` — claim keys: `super_admin`, `finance`, `support`, `country_admin`, `agent`, `partner`, `transport_manager`, `country_id`, `partner_mkan_id`, `transport_company_id`

**Exact expected claims for Phase 5I fixture:**

```text
expectedCustomClaims = { country_id: "countries/saudi_arabia" }
claimKeyCount = 1
```

(`Rev_dolh.path` drives `country_id`; no Admin/Agent/rule fields → no elevated role claims.)

| Mandate | Result |
|---|---|
| `super_admin` / `admin` / `agent` / `finance` | **false / absent** |
| Elevated privilege | **false** |
| Verdict | **`AUTH_SAFE_FIXTURE_GO`** |
| `synthetic_fixture` Auth claim | **NOT added** (prefer Firestore markers; no new authz semantics) |
| Modify / bypass Production trigger | **forbidden** |

Elevated contamination → `AUTH_SAFE_FIXTURE_NO_GO` (tested).

Code: `Phase5IClaimsAnalysis.ts`

---

## communication / CF side-effect matrix

### Communication

| Channel | On Auth create + user doc create |
|---|---|
| Email | none |
| OTP | none |
| SMS | none |
| Push / FCM welcome | none |
| Firebase welcome | none (no email provider) |

**Verdict:** `COMMUNICATION_GO` (any uncontrolled → would be NO-GO)

### Side-effect matrix (Auth create + `user/{uid}` create)

| Surface | Auth create | User create | Class |
|---|---|---|---|
| **syncUserClaimsOnWrite** | no | **yes** | **bounded_predictable** (Auth uid exists; claims = `{country_id}` only) |
| refreshMyClaims | no | no | none |
| notify / email OTP / Resend | no | no | none |
| SMS | no | no | none |
| Push welcome | no | no | none |
| Wallet / finance auto | no | no | none |
| Trip / analytics | no | no | none |
| onUserDeleted | no | no | none |

Reclassification vs 5H: with matching Auth identity present, claims sync is **bounded_predictable** (not uncontrolled `auth/user-not-found`).

Code: `Phase5ISideEffectMatrix.ts`

---

## provisioning order / partial failure / idempotency

### Order (proved from Legacy `createPanelUser`)

```text
1. auth.createUser({ disabled: true })     // Auth-generated UID
2. Firestore user/{uid} create             // same UID
3. syncUserClaimsOnWrite → setCustomUserClaims
4. operator verify (claims + membership + registry)
```

### State machine

```text
planned → auth_created → firestore_created → claims_synced → verified → pilot_ready
                                                                      ↘ failed_partial
pilot_ready → retired
```

### Partial failure

| Mode | Handling |
|---|---|
| Auth-only orphan | `failed_partial`; **no multi-create**; resume Firestore only under separate approval |
| Claims sync failure | `failed_partial`; no second Auth create |

### Idempotency / registry

```text
idempotencyKey = phase5i_provision_synthetic_driver_v1
logicalName    = phase5i_driver_pilot_fixture_v1
mode           = create_only (merge=false, overwrite=false)
```

Registry fields: logical name, UID, status — **no password / token / PII**.

Code: `Phase5IProvisioningOrder.ts`

---

## expected future write counts / operator-only gates

### This session (design / offline)

| Surface | Count |
|---|---|
| authCreate | **0** |
| firestoreUserCreates | **0** |
| claimsSetCustomUserClaims | **0** |
| audit / idemp / triggers | **0** |
| finance / trip / agent / customer | **0** |

### Hypothetical ONE successful future provision (gates open — NOT authorized now)

| Surface | Count |
|---|---|
| authCreate | 1 |
| firestoreUserCreates | 1 |
| claimsSetCustomUserClaims | 1 |
| triggerInvocations | 1 |
| auditWrites | 2 |
| idempotencyWrites | 1 |
| finance / trip / agent / customer | **0** |

### Operator-only gates (documented, NOT activated)

```text
PHASE5I_PROVISION_SYNTHETIC_DRIVER=1          # provision arm
PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN=1  # dry-run harness
SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED=1        # default false

GLOBAL_PRODUCTION_WRITE_ENABLED = false
PRODUCTION_WRITE_ENABLED = false
DRIVER_WRITE_ENABLED = false
AGENT_WRITE_ENABLED = false
CUSTOMER_WRITE_ENABLED = false
CUSTOMER_AUTH_WRITE_ENABLED = false
FINANCE_WRITE_ENABLED = false
```

`SyntheticDriverProvisioningService` — `{ dryRun, provision, verify }` — **NOT Admin UI**.  
Even when provision + write envs are armed in this phase → `DESIGN_SESSION_NO_LIVE_WRITES`.

---

## dry-run harness

```bash
PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN=1 \
  npx vitest run src/test/live/phase5i-synthetic-driver-provisioning.test.ts
```

```text
wouldWrite = false
actualWrite = false
write flags remain false
elevatedVerdict = AUTH_SAFE_FIXTURE_GO
writes = 0
```

Offline helper: `runPhase5ISyntheticDriverProvisionDryRun()`.

**Do not** run live provision / Production-connected dry-run that creates Auth or Firestore docs.

---

## tests / full count / typecheck / build

| Check | Result |
|---|---|
| `phase5i-auth-safe-synthetic-driver-provisioning.test.ts` | **32 passed** (§32) |
| `phase5i-synthetic-driver-provisioning.test.ts` (live SKIP) | **1 passed** |
| `npm test` | **PASS** — **918 passed \| 2 skipped (920)** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

Coverage (§32): write flags, env exact-1, Auth model, email/password, UID strategy, disabled compat, expected claims, elevated GO/NO-GO, no synthetic_fixture claim, typed schema, forbidden fields, geography, membership/synthetic, Auth-shaped markers, role exclusion, communication, side-effect matrix, provisioning order, state machine, partial failure, idempotency/registry, write counts, dryRun zeros, provision SKIP/disabled/design refuse, verify, isolation.

---

## Production/Auth/Finance/Trip writes = 0

```text
Production writes = 0
Auth writes = 0
Finance writes = 0
Trip writes = 0
```

---

## Provisioning readiness score /100

**90 / 100**

Auth-safe design resolves the Phase 5H `FIXTURE_CREATION_NO_GO` blocker in principle: dedicated disabled Auth + same-UID Firestore Driver + normal claims sync with non-elevated `{country_id}` only. Deduction: live provision remains gated / design-session refused; operator Production dry-run not executed (by STOP).

---

## GO | CONDITIONAL GO | NO-GO

### for ONE operator-controlled provisioning DRY-RUN only

**CONDITIONAL GO**

Conditions:

1. Write flags remain **false**; `SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED` remains unset/≠1
2. Use **only** `PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN=1` (offline plan harness)
3. Expect `wouldWrite=false`, `actualWrite=false`, `AUTH_SAFE_FIXTURE_GO`, `COMMUNICATION_GO`
4. **Do not** create Auth; **do not** create Firestore fixture
5. **Do not** enable provision mutation path; **do not** start Pilot / Finance
6. Dry-run validates design offline — it does **not** authorize Production writes

### for live Auth + Firestore provision itself

**NO-GO** this session (`DESIGN_SESSION_NO_LIVE_WRITES`; write gates not activated)

---

## Artifacts

| File | Role |
|---|---|
| `Phase5IAuthFixtureModel.ts` | Auth model / UID / disabled / email |
| `Phase5IClaimsAnalysis.ts` | Claims mirror / elevated gate |
| `Phase5ISyntheticDriverFirestoreSchema.ts` | Typed Firestore payload |
| `Phase5ISideEffectMatrix.ts` | CF + communication matrix |
| `Phase5IProvisioningOrder.ts` | Order / state machine / idemp / registry |
| `Phase5IExpectedWriteCounts.ts` | Exact write counts |
| `isPhase5ISyntheticDriverProvisionEnabled.ts` | Operator gates |
| `SyntheticDriverProvisioningService.ts` | dryRun / provision / verify |
| `Phase5IProvisionDryRun.ts` | Dry-run harness |
| `src/test/unit/phase5i-…test.ts` | §32 offline contracts |
| `src/test/live/phase5i-…test.ts` | SKIP / dry-run stub |

---

## STOP

No Auth create. No Firestore create. No write flags. No Pilot. No Finance.
