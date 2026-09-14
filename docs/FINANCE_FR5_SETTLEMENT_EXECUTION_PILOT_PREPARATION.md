# FINANCE FR5 SETTLEMENT EXECUTION / COLLECTION CONTROLLED PILOT PREPARATION

**Status:** PREPARED (live apply NOT executed)  
**FR1–FR4:** PASS/CLOSED  
**Settlement:** `test_adminnext_finance_fr2_settlement_v2_001` status=`locked` (=approved)  
**Direction:** `DRIVER_PAYS_COMPANY` (company collects from driver — NOT payout)  
**Amount:** SAR `amountMinor=1500`, `paidConfirmed=0`, `outstanding=1500`  
**FINANCE_WRITE_ENABLED:** `false` during preparation  
**Production Finance writes this session:** `0`

## Canonical Settlement V2 mechanism found

```text
SettlementCommandService.createPayment  (RBAC settlements:execute) → payment status pending
SettlementCommandService.confirmPayment (RBAC settlements:execute) → payment confirmed
  + financial_settlements.paidConfirmedMinor += amount
  + status: locked → settled (when paid == amountMinor)
Collection (Production): financial_settlement_payments
Domain resourceType alias: settlement_payments
```

Chosen execution state for full collection pilot: **settlement `settled`**, **payment `confirmed`**.  
`partially_paid` skipped because payment amount == outstanding == 1500.  
Pilot apply atomically executes create+confirm and persists payment once as confirmed (simplest safe full path; no partial-payment complexity; no bank/gateway success invented; method=`existing_company_payment`; no wallet).

## Exact transition

```text
locked → settled (payment pending→confirmed; full collection)
```

## Exact execution direction

```text
DRIVER_PAYS_COMPANY (company collects from driver; NOT payout)
```

## Exact payment amount

```text
1500 SAR (amountMinor unchanged; paidConfirmed 0→1500; outstanding 1500→0)
```

## Exact allowed writes

| Collection | Op |
|---|---|
| `finance_audit_events` | create intent + result |
| `financial_settlement_payments` | create confirmed collection record |
| `financial_settlements` | update payment-state fields only |
| `admin_next_cw_idempotency` | create FR5 idempotency |

Forbidden: order, finance_accounting_snapshots, wallet/driver ledger, payout, intents, second settlement, FR1–FR4 mutation.

## Exact expected write counts (first apply)

| Collection | Count |
|---|---|
| `financial_settlements` | 1 update |
| `settlement_payments` (=`financial_settlement_payments`) | 1 create |
| `finance_audit_events` | 2 |
| `admin_next_cw_idempotency` | 1 |
| forbidden collections | 0 |
| **Total** | **5** |

Rerun → `ALREADY_APPLIED` with **0** additional writes.  
Partial/conflict → `CONFLICT_NO_GO` (no auto-repair).

## RBAC

**Exact permission:** `settlements:execute` (also requires `finance:read`)  
Role example: `operations_manager`  
`settlements:approve` does **NOT** imply execute (`finance_approver` has approve, not execute).

## Separation of duties

```text
prepare ≠ approve ≠ execute
```

Executor must not be FR2 preparer or FR4 approver.

## IAM / ADC

**Expected ADC principal:** `info@touri-taxi.com`

**Required IAM:**

- `datastore.entities.get`
- `datastore.entities.create`
- `datastore.entities.update`
- `firebaseauth.users.get`

## Live harness (DO NOT EXECUTE in prep)

```bash
FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY=1 \
  FINANCE_WRITE_ENABLED=true \
  GLOBAL_PRODUCTION_WRITE_ENABLED=false \
  PRODUCTION_WRITE_ENABLED=false \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  SOURCE=fr4_settlement_locked \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/finance-fr5-settlement-execution-pilot-apply.test.ts
```

Cleanup:

```bash
unset FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE && \
  export FINANCE_WRITE_ENABLED=false && \
  export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false && \
  export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false
```

## Code

- Pilot: `src/application/finance/pilot/FinanceFr5*`
- Live harness (SKIP default): `src/test/live/finance-fr5-settlement-execution-pilot-apply.test.ts`
- Summary: `.local/finance-fr5-pilot/`

## GO / NO-GO

| Track | Decision |
|---|---|
| FR5 offline preparation | **PASS** when unit prep GO |
| FR5 live execution/collection pilot | Separate operator session; SoD executor required |
| Company→driver payout | **NO-GO** (not this phase; DRIVER_PAYS_COMPANY collection only) |
