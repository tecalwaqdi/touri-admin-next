# FINANCE FR2 SETTLEMENT V2 PILOT PREPARATION

**Status:** PREPARED (live apply NOT executed)  
**FR1:** PASS/CLOSED (exactly 4 writes; do not modify/rerun)  
**FC-01..05:** APPROVED  
**FINANCE_WRITE_ENABLED:** `false` during preparation  
**Production Finance writes this session:** `0`

## Scope

Exactly **ONE** operator-controlled Production Finance Settlement V2 pilot:

- Input SoT: proven FR1 `finance_accounting_snapshots/test_adminnext_finance_fr1_completed_001` only
- Create Settlement V2 **draft** referencing that snapshot
- Plus exact dependent **audit intent/result** + **FR2 idempotency** only
- No payment / payout / lock / execute / refund / chargeback
- No mutation of FR1 snapshot / order / Drivers / Agents / Customers / Auth
- No real customer trips; no third accounting book

## Classification (locked)

| Field | Value |
|---|---|
| Currency | SAR |
| Payment | cash |
| Gross | 10000 minor |
| Commission | 1500 minor |
| Driver net | 8500 minor |
| Direction | `DRIVER_PAYS_COMPANY` |
| Settlement amount | **1500** minor (= gross − driverNet cash remittance) |
| Agent | `unknown_historical` — **no** agent settlement / share invented |

## Expected Settlement V2 state

- **id:** `test_adminnext_finance_fr2_settlement_v2_001`
- **status:** `draft`
- **partyType:** `driver`
- **partyId:** `test_adminnext_finance_fr1_driver_ref_001`
- **countryId:** `saudi_arabia`
- **direction:** `DRIVER_PAYS_COMPANY`
- **amountMinor:** `1500`
- **paidConfirmedMinor:** `0`
- **claim:** `drv_line_test_adminnext_finance_fr1_completed_001` → 1500 SAR
- **sourceAccountingSnapshotId:** `test_adminnext_finance_fr1_completed_001`
- **paymentExecutionForbidden:** true
- **mutatesFinanceSnapshot:** false
- **agentSettlementCreated:** false

## Expected first-apply writes

| Collection | Count |
|---|---|
| `financial_settlements` | 1 |
| `finance_audit_events` | 2 |
| `admin_next_cw_idempotency` | 1 |
| `finance_accounting_snapshots` / order / payments / drivers / agents / customers | 0 |
| **Total** | **4** |

Rerun → `ALREADY_APPLIED` with **0** additional writes.

## IAM / ADC

**Expected ADC principal:** `info@touri-taxi.com` (authorized_user tokeninfo — same FR1 pattern)

**Required IAM:**

- `datastore.entities.get`
- `datastore.entities.create`
- `datastore.entities.update`
- `firebaseauth.users.get`

## Live harness (DO NOT EXECUTE in prep)

```bash
FINANCE_FR2_SETTLEMENT_PILOT_APPLY=1 \
  FINANCE_WRITE_ENABLED=true \
  GLOBAL_PRODUCTION_WRITE_ENABLED=false \
  PRODUCTION_WRITE_ENABLED=false \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  SOURCE=fr1_snapshot \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/finance-fr2-settlement-pilot-apply.test.ts
```

Cleanup:

```bash
unset FINANCE_FR2_SETTLEMENT_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE && \
  export FINANCE_WRITE_ENABLED=false && \
  export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false && \
  export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false
```

## Code

- Pilot: `src/application/finance/pilot/FinanceFr2*`
- Live harness (SKIP default): `src/test/live/finance-fr2-settlement-pilot-apply.test.ts`
- Summary: `.local/finance-fr2-pilot/`
