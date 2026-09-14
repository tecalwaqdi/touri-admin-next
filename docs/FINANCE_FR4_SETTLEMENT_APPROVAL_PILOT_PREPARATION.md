# FINANCE FR4 SETTLEMENT APPROVAL CONTROLLED PILOT PREPARATION

**Status:** PREPARED (live apply NOT executed)  
**FR1:** PASS/CLOSED  
**FR2:** PASS/CLOSED (`test_adminnext_finance_fr2_settlement_v2_001` draft)  
**FR3:** PASS/CLOSED (recon PASS; writes=0)  
**FC-01..05:** APPROVED  
**FINANCE_WRITE_ENABLED:** `false` during preparation  
**Production Finance writes this session:** `0`

## Scope

Exactly **ONE** operator-controlled Production Finance Settlement Approval pilot:

- Reuse existing Settlement V2 `test_adminnext_finance_fr2_settlement_v2_001` (no second settlement)
- Transition: **draft → locked** (= FR4 approval; ops/display **approved**)
- Dual control: approver ≠ creator (prepare ≠ approve ≠ execute)
- Plus exact dependent **audit intent/result** + **FR4 idempotency** only
- No payment / payout / execute
- No mutation of FR1 snapshot / order / amounts / currency / direction / source
- No `settlement_payments`

## Exact transition

```text
draft → locked (= approved)
```

## Exact allowed field mutations

```text
status (= locked)
lockedByUserId
lockedAtUtc
approvedAt
approvedBy
approvalCorrelationId
updatedAtUtc
(+ FR4 idempotency / audit correlation metadata)
```

Immutable: `amountMinor`, `paidConfirmedMinor`, `currency`, `direction`, `sourceAccountingSnapshotId`, `claims`, `createdByUserId`.

## Expected first-apply writes

| Collection | Count |
|---|---|
| `financial_settlements` | 1 **update** |
| `finance_audit_events` | 2 |
| `admin_next_cw_idempotency` | 1 |
| `finance_accounting_snapshots` / order / `settlement_payments` / drivers / agents / customers | 0 |
| **Total** | **4** |

Rerun → `ALREADY_APPLIED` with **0** additional writes.  
Partial/conflict → `CONFLICT_NO_GO` (no auto-repair).

## RBAC

**Exact permission:** `settlements:approve`  
(also requires `finance:read` for actor verify)

Role example: `finance_approver` (must not be the FR2 prepare creator).

## IAM / ADC

**Expected ADC principal:** `info@touri-taxi.com` (authorized_user tokeninfo — same FR1 pattern)

**Required IAM:**

- `datastore.entities.get`
- `datastore.entities.create`
- `datastore.entities.update`
- `firebaseauth.users.get`

## Live harness (DO NOT EXECUTE in prep)

```bash
FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY=1 \
  FINANCE_WRITE_ENABLED=true \
  GLOBAL_PRODUCTION_WRITE_ENABLED=false \
  PRODUCTION_WRITE_ENABLED=false \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  SOURCE=fr2_settlement_draft \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/finance-fr4-settlement-approval-pilot-apply.test.ts
```

Cleanup:

```bash
unset FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE && \
  export FINANCE_WRITE_ENABLED=false && \
  export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false && \
  export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false
```

## Code

- Pilot: `src/application/finance/pilot/FinanceFr4*`
- Live harness (SKIP default): `src/test/live/finance-fr4-settlement-approval-pilot-apply.test.ts`
- Summary: `.local/finance-fr4-pilot/`

## GO / NO-GO

| Track | Decision |
|---|---|
| FR4 offline preparation | **PASS** when unit prep GO |
| FR4 live approval pilot | Separate operator session; dual-control actor required |
| Payment / payout / execute | **NO-GO** (not this phase) |
