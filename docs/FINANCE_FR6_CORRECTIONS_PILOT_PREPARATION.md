# FINANCE FR6 ADJUSTMENTS / REFUNDS / CHARGEBACKS / REVERSALS PREPARATION

**Status:** PREPARED (live apply NOT executed)  
**FR1–FR5:** PASS/CLOSED  
**Synthetic chain:** FR1 snapshot 10000/1500/8500 SAR → FR2 DRIVER_PAYS_COMPANY 1500 → FR4 locked → FR5 settled, payment confirmed, paidConfirmed=1500, outstanding=0, no wallet/payout  
**FINANCE_WRITE_ENABLED:** `false` during preparation  
**Production Finance writes this session:** `0`

## Existing canonical mechanisms found

```text
AdjustmentCommandService.create / approve / reject
  RBAC: finance:adjust, finance:adjust_approve (SoD creator ≠ approver)
  Collection: finance_adjustments (append-only; mutatesOrderMajors=false)

SettlementCommandService.reversePayment / void
  RBAC: settlements:reverse
  Payment row retained (status → reversed); never deleted
  Settled settlement: reverse DENIED (settled_history_immutable) → use adjustment

RefundAccountingCommandService.record
  RBAC: finance:adjust (no separate refund permission invented)
  Collection: finance_refund_accounting
  Kinds: customer_refund | internal_settlement_correction

ChargebackAccountingCommandService.record (FC-04 APPROVED)
  RBAC: finance:adjust
  Collection: finance_chargeback_accounting
  disputed → disputed_suspense; fees separate; never rewrite trip

FC-05 GATEWAY_FEE_POLICY_APPROVED_F6 — independent fee; default owner Company
```

## Exact model

| Path | Model | Live on FR5 cash chain |
|---|---|---|
| Adjustment | append-only draft→approved (atomic approved write in pilot) | **GO** |
| Reversal | compensating payment.reverse on locked/partially_paid only | **NO-GO** (settled immutable) |
| Refund | append-only refund accounting; customer needs gateway session | **NO-GO** (cash / no gateway) |
| Chargeback | FC-04 append-only; evidence or suspense | **NO-GO** (no gateway chargeback) |

## Exact immutable fields

```text
FR1 snapshot principal (gross/commission/driverNet)
order majors
settlement amountMinor / currency / direction / sourceAccountingSnapshotId
settled settlement status + paidConfirmedMinor (not reopened via reverse)
confirmed payment row retained (never deleted)
```

## Exact append-only fields/records

```text
finance_adjustments (create approved doc)
finance_audit_events (intent + result)
admin_next_cw_idempotency (FR6 key)
finance_refund_accounting (offline only this phase)
finance_chargeback_accounting (offline only this phase)
settlement_payments.status → reversed (offline; not on settled FR5 live)
```

## Exact RBAC

```text
finance:adjust          — create adjustment / refund.account / chargeback.account
finance:adjust_approve  — approve/reject adjustment (≠ creator)
settlements:reverse     — payment.reverse / settlement.void
```

No duplicate refund/chargeback permissions invented.

## Exact SoD

```text
adjust preparer ≠ adjust approver
settlements:execute does NOT imply finance:adjust
finance_approver has adjust_approve, not adjust / reverse / execute
accountant has adjust, not adjust_approve / reverse
```

## Exact expected writes (adjustment live pilot, first apply)

| Collection | Count |
|---|---|
| `finance_adjustments` | 1 create |
| `finance_audit_events` | 2 |
| `admin_next_cw_idempotency` | 1 |
| forbidden (settlement/payment/snapshot/order/refund/chargeback) | 0 |
| **Total** | **4** |

Rerun → `ALREADY_APPLIED` with **0** additional writes.  
Partial/conflict → `CONFLICT_NO_GO` (no auto-repair).

## Exact IAM

**Expected ADC principal:** `info@touri-taxi.com`

```text
datastore.entities.get
datastore.entities.create
firebaseauth.users.get
```

(No settlement UPDATE required — append-only adjustment.)

## Live pilot safety

**Safe:** YES for bounded append-only synthetic adjustment (25 SAR neutral_memo) linked to FR5 settled settlement + FR1 order/snapshot. Does not mutate FR1/settlement/payment.

**Unsafe / offline-only on this chain:** customer refund, chargeback, payment reverse of settled FR5 payment.

## Live harness (DO NOT EXECUTE in prep)

```bash
FINANCE_FR6_ADJUSTMENT_PILOT_APPLY=1 \
  FINANCE_WRITE_ENABLED=true \
  GLOBAL_PRODUCTION_WRITE_ENABLED=false \
  PRODUCTION_WRITE_ENABLED=false \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  SOURCE=fr5_settlement_settled \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/finance-fr6-adjustment-pilot-apply.test.ts
```

Cleanup:

```bash
unset FINANCE_FR6_ADJUSTMENT_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE && \
  export FINANCE_WRITE_ENABLED=false && \
  export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false && \
  export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false
```

## Code

- Integrity: `src/domain/finance/v2/Fr6CorrectionIntegrity.ts`
- Services: `AdjustmentCommandService`, `RefundAccountingCommandService`, `ChargebackAccountingCommandService`, `SettlementCommandService.reversePayment`
- Pilot: `src/application/finance/pilot/FinanceFr6*`
- Live harness (SKIP default): `src/test/live/finance-fr6-adjustment-pilot-apply.test.ts`
- Unit: `src/test/unit/finance-fr6-corrections-pilot.test.ts`

## GO / NO-GO

| Track | Decision |
|---|---|
| FR6 offline preparation | **PASS** when unit prep GO |
| FR6 live append-only adjustment pilot | Prepared; separate operator session |
| Live refund / chargeback / settled reverse | **NO-GO** on this cash FR5 chain |
