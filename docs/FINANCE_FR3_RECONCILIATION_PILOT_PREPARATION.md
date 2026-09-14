# FINANCE FR3 RECONCILIATION CONTROLLED PILOT PREPARATION

**Status:** PREPARED (read-only; live verify NOT executed)  
**FR1:** PASS/CLOSED  
**FR2:** PASS/CLOSED (`test_adminnext_finance_fr2_settlement_v2_001` draft)  
**FC-01..05:** APPROVED  
**Persistence:** **read-only shadow** (F3 / D-10 / RunReconciliation — write run doc later)  
**FINANCE_WRITE_ENABLED:** `false`  
**Production Finance writes this session:** `0`  
**Write harness:** **not required** (design does not require Production recon persistence)

## Design decision (persistence)

Inspected `docs/FINANCE_IMPLEMENTATION_DESIGN.md` + `ReconciliationService`:

| Evidence | Implication |
|---|---|
| Phase F3 = “recon Fake / read-only runs” | Shadow compare, no Production mutation |
| Migration §14.6.5 = shadow recon without writes | Prefer read-only |
| `RunReconciliation` = `finance:read` (**write run doc later**) | Persist later ≠ this pilot |
| `finance_reconciliation_runs` = Fake first; Production later | Do **not** invent Production table |
| `ReconciliationRun.shadowOnly=true`, `productionWrites=0` | Read/compare artifact |

**FR3 pilot = read-only.** No `finance_reconciliation_runs` / audit / idempotency Production writes.

## Scope

Prove FR1 accounting snapshot ↔ FR2 Settlement V2 ↔ expected balances:

| Dimension | Expected |
|---|---|
| FR1 commission | 1500 |
| FR2 claim | 1500 |
| paidConfirmedMinor | 0 |
| outstandingMinor | 1500 |
| direction | `DRIVER_PAYS_COMPANY` |
| currency | SAR |
| source | `test_adminnext_finance_fr1_completed_001` |
| settlement id | `test_adminnext_finance_fr2_settlement_v2_001` |

Forbidden: payment / payout / lock / approve / order mutation / FR1 snapshot rewrite / Settlement V2 amount rewrite to pass.

## Exact reconciliation result (synthetic)

```text
snapshotMatchesSettlement = true
currencyMatches = true
directionMatches = true
claimMatchesCommission = true
paidConfirmedMinor = "0"
outstandingMinor = "1500"
reconciliationStatus = PASS
reconciliationBlockers = []
sourceIntegrityPass = true
idempotencyIntegrityPass = true
```

## Exact expected writes

| Collection | Count |
|---|---|
| `finance_reconciliation_runs` | 0 |
| `finance_audit_events` | 0 |
| `admin_next_cw_idempotency` | 0 |
| `finance_accounting_snapshots` / `financial_settlements` / payments / order / drivers / agents / customers | 0 |
| **Total** | **0** |

## IAM

**Writes:** none required (`[]`).

**Optional live read-verify only:**

- `datastore.entities.get`
- `firebaseauth.users.get`

**Expected ADC principal:** `info@touri-taxi.com`

## Optional live read verify (NOT a write harness; DO NOT execute in prep)

```bash
FINANCE_FR3_RECON_PILOT_VERIFY=1 \
  FINANCE_WRITE_ENABLED=false \
  GLOBAL_PRODUCTION_WRITE_ENABLED=false \
  PRODUCTION_WRITE_ENABLED=false \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  SOURCE=fr1_fr2_read_only \
  FIREBASE_ID_TOKEN='…' \
  # read-only verify — no write harness (persistence not required by design) \
  npx vitest run src/test/live/finance-fr3-reconciliation-pilot-verify.test.ts
```

> Live verify harness: `src/test/live/finance-fr3-reconciliation-pilot-verify.test.ts` (SKIP default; DO NOT execute in prep).

Cleanup:

```bash
unset FINANCE_FR3_RECON_PILOT_VERIFY FIREBASE_ID_TOKEN SOURCE && \
  export FINANCE_WRITE_ENABLED=false && \
  export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false && \
  export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false
```

## Code

- Pilot: `src/application/finance/pilot/FinanceFr3*`
- Offline tests: `src/test/unit/finance-fr3-reconciliation-pilot.test.ts`
- Summary path (if written later): `.local/finance-fr3-pilot/`

## GO / NO-GO

| Track | Decision |
|---|---|
| FR3 offline preparation | **PASS** when unit prep GO |
| Persistence | **read-only** |
| FR3 live write reconciliation | **NO-GO** (not required; writes=0) |
| FR3 live read verify | Separate operator session; still writes=0 |
