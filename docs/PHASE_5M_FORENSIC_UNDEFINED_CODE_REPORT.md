# Phase 5M Forensic — Firestore `code: undefined` (Driver Pilot Apply)

**Date:** 2026-09-13  
**Workspace:** `/Users/ventura/touri-admin-next`  
**Constraint compliance:** No Phase 5M Apply re-run. No Production mutation/repair. Offline code fix + tests only.

---

## Executive verdict

Live Apply reached Driver domain commit, then failed writing the **success** Audit RESULT because the payload contained `code: undefined`. Firestore Admin SDK rejected the document. The pipeline catch path then wrote a **failure** Audit RESULT (with `code: "INTERNAL_WRITE_FAILURE"`), which succeeded — producing counters `Driver/AuditIntent/AuditResult/Idempotency = 1` with `AuthClaim = 0` and `PHASE5M_DRIVER_PILOT_WRITE_NO_GO`.

**GO/NO-GO for re-Apply:** **NO-GO** until this offline fix is reviewed/merged and a fresh operator Apply is deliberately authorized. Domain is already `needs_changes` on the synthetic fixture — any retry must treat as partial / already-applied, not a blind re-write.

---

## ACTUAL_DRIVER_STATE

| Field | Value | Source |
| --- | --- | --- |
| uid | `XZPLpmbFoOa0C4MeR5pL60SMESf2` | `.local/phase5j-fixture/registry.json` |
| registry.status | `pilot_ready` | local registry (not updated by Apply) |
| registration_status | **`needs_changes`** | ADC read-only `user/{uid}` |
| ismndob | `true` | ADC |
| actev_mndob | `false` | ADC |
| on_trip | `false` | ADC |
| updateTime | `2026-09-13T03:54:46.145Z` | ADC |
| createTime | `2026-09-13T02:08:16.623Z` | ADC |
| needs_changes | **yes** (current state) | ADC |
| Auth | exists, **disabled**, claims `{ country_id: "countries/saudi_arabia" }` | ADC `auth.getUser` only |

Local Apply summary still shows `currentState: "pending_review"` / `afterState: null` because the harness aborted on `!applyOutcome.ok` before post-write verification.

---

## EXACT_FAILURE_STAGE

After successful Driver domain write, in `executeDriverControlledWrite` success arm:

1. `repository.apply` → **PASS** (`driverDomainWrites=1`)
2. `idempotency.put` (first create) → **PASS** (`idempotencyWrites=1`, `auditResultId: ""`)
3. `buildDriverWriteAuditResult({ outcome: "applied" /* no code */ })` → object with **`code: undefined`**
4. `audit.recordResult` → `admin_next_cw_audit/{auditId}.create({...result, phase:"5M"})` → **FAIL** Firestore undefined
5. Inner `catch` builds failure RESULT with `code: "INTERNAL_WRITE_FAILURE"` → **PASS** (`auditResultWrites=1`)
6. Second idempotency put (patch `auditResultId`) → **never reached**
7. Phase 5M post-write Auth claim verify → **never reached** (`authClaimWrites=0`)

---

## EXACT_FAILURE_COLLECTION

- **Collection:** `admin_next_cw_audit`
- **Document (failed create):** success RESULT id never persisted (create rejected)
- **Document (persisted failure RESULT):** `dwr_mtza5xc7_ssxaoeie`
- **Related INTENT:** `dwi_mtza5vca_4y4zsr1v`
- **Idempotency:** `admin_next_cw_idempotency/phase5l_driver_needs_changes_pilot_v1`

---

## EXACT_FAILURE_FILE_FUNCTION

| Layer | Location |
| --- | --- |
| Builder | `src/application/controlled-writes/drivers/DriverWriteAudit.ts` → `buildDriverWriteAuditResult` (assigned `code: input.code` even when undefined) |
| Call site | `src/application/controlled-writes/drivers/DriverControlledWriteService.ts` → `executeDriverControlledWrite` success path (~L239–250) |
| Firestore write | `src/application/controlled-writes/pilot/Phase5MProductionWriteAdapters.ts` → `Phase5MFirestoreAuditPort.recordResult` → `doc.create({ ...result, phase: "5M" })` |
| Call chain | `runPhase5MDriverPilotApply` → `executeDriverControlledWrite` → `buildDriverWriteAuditResult` → `Phase5MFirestoreAuditPort.recordResult` → `Firestore DocumentReference.create` |

---

## WHY_CODE_WAS_UNDEFINED

Success audit results intentionally omit an error `code`. `buildDriverWriteAuditResult` still set `code: input.code` when the caller passed no `code`, producing a property whose value is JavaScript `undefined`. Spreading that object into Admin SDK `create()` violates Firestore encoding (unless `ignoreUndefinedProperties` is enabled — **not** used, by design).

Intent succeeded because `reasonCode: "missing_document"` was defined. Failure RESULT in the catch path succeeded because `code: mapped.code` was `"INTERNAL_WRITE_FAILURE"`.

---

## WHY COUNTERS SHOWED 1 / 1 / 1 / 1 BEFORE FAILURE

| Counter | Why = 1 |
| --- | --- |
| AuditIntent | Intent create succeeded before domain write |
| DriverDomain | Transaction update `registration_status → needs_changes` committed |
| Idempotency | First put create succeeded (with empty `auditResultId`) |
| AuditResult | **Failure** RESULT create in catch succeeded after success RESULT was rejected |

Harness then returned `PHASE5M_DRIVER_PILOT_WRITE_NO_GO` with `denials: ["INTERNAL_WRITE_FAILURE"]` and the Firestore undefined message as `blocker`. `productionWrites=1` counts domain writes only.

---

## AUDIT_RECORD_STATUS

ADC read-only (phase=`5M`, driverId=fixture uid):

| Doc | kind | outcome | code | Notes |
| --- | --- | --- | --- | --- |
| `dwi_mtza5vca_4y4zsr1v` | AUDIT_INTENT | — | absent | `reasonCode=missing_document`, from→to pending_review→needs_changes |
| `dwr_mtza5xc7_ssxaoeie` | AUDIT_RESULT | **failed** | `INTERNAL_WRITE_FAILURE` | intentAuditId links to INTENT; this is the catch-path record, **not** a success RESULT |

**Consistent with:** domain committed + success RESULT never written + failure RESULT written.

---

## IDEMPOTENCY_RECORD_STATUS

`admin_next_cw_idempotency/phase5l_driver_needs_changes_pilot_v1` **exists**:

- `result.ok=true`, `status=applied`, `toState=needs_changes`
- `auditIntentId=dwi_mtza5vca_4y4zsr1v`
- **`auditResultId=""`** (second put never ran)
- fingerprint matches needs_changes + prior precondition token `fs_ut_2026-09-13T02:08:16.623Z`

**Consistent with:** first put after domain commit; incomplete relative to happy-path (missing auditResultId patch).

---

## AUTH_CLAIMS_STATUS

- Auth user **exists**, **disabled=true**
- Claims: `{ country_id: "countries/saudi_arabia" }` only — matches Phase 5I/5L expected payload
- **No claim mutation performed** by this forensic session

---

## SIDE_EFFECT_ASSESSMENT (`authClaimWrites=0`)

**Classification:** harness counter / early-abort verification gap — **not** evidence that the CF side effect is missing.

Evidence:

1. Domain `user/{uid}` update **did** commit → Production `syncUserClaimsOnWrite` is expected to fire (`firestore.onWrite`, always `setCustomUserClaims` when `after.exists`).
2. `expectedClaimsChange=false` — claims remain `{ country_id }` (registration_status is not a claim input).
3. Live claims already match expected — consistent with CF having run (or claims already correct).
4. Phase 5M only increments/synthesizes `authClaimWrites` on the **success post-verify** path (`runPhase5MDriverPilotApply` after `applyOutcome.ok`). That path never ran because Apply returned `INTERNAL_WRITE_FAILURE`.

So `AuthClaim=0` is **missing harness observation**, not a proven missing required Auth write. Operator ADC cannot call `setCustomUserClaims` and does not need to for Pilot (`operatorAuthWritePermissionRequired=false`).

---

## CF TRIGGER EXPECTATIONS (code / log-safe only)

From `Phase5LAuthTriggerExpectation` / `PHASE_5I_SYNC_USER_CLAIMS_EFFECT` / `Phase5MExpectedWriteCounts`:

- Export: `syncUserClaimsOnWrite`
- Path: `user/{uid}` onWrite
- On any update with `after.exists` → `setCustomUserClaims`
- Claims payload ignores `registration_status` → semantic claims unchanged
- Expected count if Apply fully succeeded: `authClaimWrites=1` (async CF, not operator write)

No deploy / CF changes performed.

---

## MINIMAL_FIX

1. **`buildDriverWriteAuditResult` / `buildDriverWriteAuditIntent`** — only assign optional fields (`code`, `reasonCode`, `fromState`, `toState`) when defined (omit property otherwise).
2. **`omitUndefinedForFirestore.ts`** — shared omit helper + offline Firestore-undefined assertion.
3. **`Phase5MProductionWriteAdapters`** — `phase5MFirestoreWritePayload()` wraps audit/idempotency create/set payloads with deep omit.
4. **Do not** enable global `ignoreUndefinedProperties`.

Files touched:

- `src/application/controlled-writes/omitUndefinedForFirestore.ts` (new)
- `src/application/controlled-writes/drivers/DriverWriteAudit.ts`
- `src/application/controlled-writes/pilot/Phase5MProductionWriteAdapters.ts`
- `src/test/unit/phase5m-forensic-undefined-code.test.ts` (new)
- `docs/PHASE_5M_FORENSIC_UNDEFINED_CODE_REPORT.md` (this file)

---

## TESTS / TYPECHECK / BUILD

| Command | Result | Production writes |
| --- | --- | --- |
| `npm test` | **PASS** — 1042 passed, 2 skipped (incl. `phase5m-forensic-undefined-code` 7/7) | 0 |
| `npm run typecheck` | **PASS** | 0 |
| `npm run build` | **PASS** | 0 |

ADC forensic reads only (`get` / `getUser` / query). No Apply. No Auth claim mutation. No Production repair.

---

## GO/NO-GO

**FORENSIC + OFFLINE FIX: COMPLETE**  
**PRODUCTION RE-APPLY: NO-GO** (stop here per HARD STOP; domain already `needs_changes`; do not re-Apply without a dedicated partial-recovery / already-applied plan).

---

## Post-Driver write order (reference)

Documented in `PHASE_5M_CONSOLIDATED_WRITE_ORDER` / `executeDriverControlledWrite`:

1. Audit INTENT create  
2. Controlled repo domain update  
3. Idempotency PUT (create)  
4. Audit RESULT create ← **failed here on success payload**  
5. Idempotency PUT (merge auditResultId) ← not reached  
6. Async CF `syncUserClaimsOnWrite` ← expected from (2); harness did not observe
