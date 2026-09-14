# TOURI TAXI ADMIN NEXT — PHASE 5H SYNTHETIC DRIVER FIXTURE PREPARATION REPORT

**Date:** 2026-09-13  
**Phase:** 5H Dedicated Synthetic Production Driver Fixture Preparation  
**Project path:** `/Users/ventura/touri-admin-next`  
**Mode:** PREPARATION ONLY — no Production fixture creation  
**Production writes this session:** **0**  
**Auth writes this session:** **0**  
**Finance writes this session:** **0**  
**Trip writes this session:** **0**  
**Synthetic Driver created:** **NO**  
**Auth user created:** **NO**  
**Pilot executed:** **NO**  
**Finance started:** **NO**  
**Write flags enabled:** **NO** (all remain false)

---

## Context

Phase 5G live inventory: `NO_SAFE_EXISTING_PILOT`; recommendation=`PREPARE_DEDICATED_SYNTHETIC_PRODUCTION_FIXTURE`.  
Phase 5H prepares a **dedicated** synthetic fixture schema + operator harnesses. It does **not** create the fixture, does **not** use existing real/synthetic Drivers, and does **not** enable write flags.

---

## exact fixture schema

**Collection:** `user`  
**Document id:** `test_adminnext_phase5h_driver_pilot_001`  
**Typed type:** `Phase5HSyntheticDriverFixtureDoc` (not `Record`)

| Field | Value | Purpose |
|---|---|---|
| `ismndob` | `true` | Driver discriminator (4A-5) |
| `registration_status` | `pending_review` | Future Pilot before state |
| `actev_mndob` | `false` | Account inactive |
| `is_test` | `true` | Synthetic marker |
| `functional_test` | `true` | Synthetic marker |
| `qa_fixture` | `true` | Synthetic marker |
| `on_trip` | `false` | Explicit idle (absent → trip unknown → 5G fail-closed) |
| `mndon_newacc` | `false` | Explicit idle |
| `is_online` | `false` | Offline |
| `Rev_dolh` | `{ path: countries/saudi_arabia, id: saudi_arabia }` | Mapped country |
| `mndob_vill` | `{ path: villages/city_sa_riyadh, id: city_sa_riyadh }` | Mapped city |

**Forbidden (not on allowlist):** phone/email/display_name/national ID/bank/outstanding, Agent/Admin flags, `uid`, Storage image fields, FCM.

Code: `Phase5HSyntheticDriverFixtureSchema.ts`

---

## document ID strategy

```text
test_adminnext_phase5h_driver_pilot_001
```

- Matches proven synthetic id prefixes: `cp5_|test_|demo_|golden_|qa_`
- **Not** a Firebase Auth UID; **not** UID-shaped (Auth UIDs are opaque ~28-char strings)
- By Legacy convention `user/{uid}` document id **is** the Auth UID for panel/driver apps
- Firestore accepts non-Auth ids; Cloud Functions `syncUserClaimsOnWrite` still treats path param as Auth UID

---

## Auth dependency

```text
AUTH_REQUIRED_FOR_FIXTURE = true
FIXTURE_CREATION_NO_GO = true
createFakeAuthUser = forbidden
```

**STOP reason:** Production `syncUserClaimsOnWrite` (`user/{uid}` onWrite) always calls `admin.auth().setCustomUserClaims(uid, claims)`. Without a real Auth user → `auth/user-not-found` (uncontrolled CF failure). Prefer Firestore-only → **cannot** create cleanly. Auth user creation is **forbidden** in Phase 5H → **do not create Auth; do not create fixture**.

Note: `AUTH_REQUIRED_FOR_PILOT_TARGET` remains **false** (Pilot mutation is Firestore-domain-only). Auth is required for **fixture create**, not for the future `needs_changes` Pilot write itself.

---

## Cloud Functions trigger analysis

| Export | Fires on user create? | Class | Notes |
|---|---|---|---|
| **syncUserClaimsOnWrite** | **YES** | **uncontrolled** | Auth `setCustomUserClaims`; fails without Auth user |
| refreshMyClaims | no | none | Callable only |
| notifyAdminsDriverApplication | no | none | Only from `submitDriverApplicationV2` |
| adminAdjustDriverWallet | no | none | No wallet auto-create |
| onUserDeleted | no | none | Auth delete path |

Evidence (read-only): `ara-ban/admin/Admi/firebase/functions/index.js`, `panel_claims.js`.  
No finance / trip / notification auto-writes on bare user doc create besides the Auth claims sync attempt.

**Verdict:** Uncontrolled Auth trigger → `FIXTURE_CREATION_NO_GO`.

---

## country/city choice

| Axis | Value | Mapping |
|---|---|---|
| Country | `saudi_arabia` (`countries/saudi_arabia`) | **mapped** (closed `CountryCanonicalization`) |
| City | `city_sa_riyadh` (`villages/city_sa_riyadh`) | **mapped** (closed `CityAliasResolver` identity passthrough) |

---

## synthetic classification

Markers (reuse existing conventions; no fuzzy name/email):

- Document id prefix `test_`
- Booleans: `is_test`, `functional_test`, `qa_fixture`

Passes:

- `classifyProvenSyntheticDriver` → synthetic
- `isTestOrNoncanonicalDriver` → testOrNoncanonical
- `classifyDriverMembership` → operational Driver
- Phase 5F eligibility → eligible
- Phase 5G inventory → `safePilotEligible=true`
- Phase 5G action enum → `needs_changes` ranks **SAFE**

---

## PII policy

```text
realPiiAllowed = false
storageUploads = forbidden
unavoidableSyntheticPlaceholders = []
```

No display_name / email / phone / national ID / bank / images. needs_changes Pilot does not require Storage documents.

---

## expected future write counts

| Surface | Prep / dry-run (this session) | Future create if unblocked* | Future create while NO-GO |
|---|---|---|---|
| fixtureDomainWrites | **0** | 1 | 0 |
| auditWrites | **0** | 2 | 0 |
| idempotencyWrites | **0** | 1 | 0 |
| triggerSideEffectWrites | **0** | 1 (`syncUserClaimsOnWrite`) | 0 |
| authWrites | **0** | 1 (claims) | 0 |
| financeWrites | **0** | 0 | 0 |
| tripWrites | **0** | 0 | 0 |

\*Hypothetical only — **not authorized**. Auth create still forbidden.

---

## create-only semantics

- Mode: **create_only**
- `merge=false`, `overwrite=false`, `applyToExisting=false`
- Existing doc → **`FIXTURE_ALREADY_EXISTS`** (no merge)
- Operator-only; **not** Admin UI
- Separate from Pilot flags (5E/5F/5G)

---

## idempotency

```text
idempotencyKey = phase5h_create_synthetic_driver_fixture_v1
```

Preconditions for future create (when unblocked): document must not exist; write flags gated separately; Auth create forbidden; project id match; dedicated document id only.

---

## rollback/retention strategy

| Strategy | Status |
|---|---|
| **A — retain marked synthetic** | Preferred default after any future create |
| **B — future controlled deletion** | Documented; **not implemented**; no destructive delete now |

Pilot rollback remains separate (`needs_changes` → resubmit / restore registration_status under separate approval).

---

## fixture dry-run harness

`src/test/live/phase5h-synthetic-driver-fixture.test.ts`  
+ `runPhase5HFixtureCreateDryRun()`

```bash
PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE_DRY_RUN=1 \
  npx vitest run src/test/live/phase5h-synthetic-driver-fixture.test.ts
```

```text
wouldWrite = false   (FIXTURE_CREATION_NO_GO)
actualWrite = false
write flags remain false
writes = 0
```

---

## fixture create harness

Same live file. Default SKIP:

```text
PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE unset/≠1 → PHASE5H_FIXTURE_CREATE_SKIP
PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE=1 → still FIXTURE_CREATION_NO_GO (no mutation)
```

`SyntheticDriverFixtureRepository`: operator-only, create-only, hard-locked unreachable, no apply-to-existing, not Admin UI.

---

## Future Pilot compatibility

After a future successful create (currently blocked), 5F/5G must see:

| Check | Expected |
|---|---|
| synthetic | true |
| operationalDriver | true |
| registration | pending_review |
| safePilotEligible | true |
| planned action | needs_changes |

**Schema fix vs 5E draft:** explicit `on_trip=false` + `mndon_newacc=false` (absent busy flags → `tripState=unknown` → 5G not safe). City upgraded to canonical `city_sa_riyadh` (`cityMapping=mapped`).

Offline `assertPhase5HFixturePilotCompatibility()` validates this without Production I/O.

---

## tests / typecheck / build

| Check | Result |
|---|---|
| `src/test/unit/phase5h-synthetic-driver-fixture-preparation.test.ts` | **22 passed** |
| `src/test/live/phase5h-synthetic-driver-fixture.test.ts` | **1 passed** (SKIP path) |
| `npm test` | **PASS** — **868 passed \| 2 skipped (870)** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** (see session validation) |

Coverage (§22): write-flag guards, env exact-1, document id, AUTH_REQUIRED_FOR_FIXTURE STOP, syncUserClaimsOnWrite uncontrolled, no notify/wallet on create, schema fields, forbidden PII, mapped geography, synthetic+membership, typed allowlist, write counts, SKIP/NO-GO gates, FIXTURE_ALREADY_EXISTS, rollback A/B, unreachable repo, dry-run zeros, 5F/5G compatibility, trip-idle schema necessity, isolation.

---

## write flags (remain false)

```text
GLOBAL_PRODUCTION_WRITE_ENABLED = false
PRODUCTION_WRITE_ENABLED = false
DRIVER_WRITE_ENABLED = false
AGENT_WRITE_ENABLED = false
CUSTOMER_WRITE_ENABLED = false
CUSTOMER_AUTH_WRITE_ENABLED = false
FINANCE_WRITE_ENABLED = false
```

---

## Fixture Preparation score /100

**82 / 100**

Deduction: Auth/trigger blocker prevents GO for actual fixture create (`FIXTURE_CREATION_NO_GO`). Schema, Pilot compatibility, harnesses, and offline validation are complete.

---

## GO | CONDITIONAL GO | NO-GO

### for ONE operator-controlled FIXTURE CREATION DRY-RUN only

**CONDITIONAL GO**

Conditions:

1. Write flags remain **false**
2. Use **only** `PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE_DRY_RUN=1` (not create / not Pilot flags)
3. Expect `wouldWrite=false`, `actualWrite=false`, `createBlockedCode=FIXTURE_CREATION_NO_GO`
4. **Do not** create Auth
5. **Do not** enable create harness as a mutation path
6. Dry-run validates schema/plan/compatibility offline — it does **not** authorize Production writes

### for fixture create itself

**NO-GO** (`AUTH_REQUIRED_FOR_FIXTURE=true`, Auth create forbidden, uncontrolled `syncUserClaimsOnWrite`)

---

## STOP

No create. No write flags. No Pilot. No Finance. No Auth.
