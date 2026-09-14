# FINANCE CONTROLLED ROLLOUT PREPARATION (OFFLINE)

**Status:** PREPARED (FR1–FR7)  
**F6:** PASS (FC-01..05 APPROVED; FC-01 = 15% versioned)  
**FINANCE_WRITE_ENABLED:** `false` (hard during prep)  
**Production Finance writes:** `0`  
**Live execute / payout / migrate / CF deploy:** forbidden in this phase  
**Harness:** `PHASE_FINANCE_CONTROLLED_ROLLOUT=1` — SKIP by default; offline status only  
**FR1 pilot:** see `docs/FINANCE_FR1_PILOT_PREPARATION.md` (prep only; live apply not executed)

## Authoritative flow

```
order majors → Finance domain → Settlement V2 → reconciliation / payout
```

No third accounting book.

## F6 policy lock

| Code | Status | Notes |
|---|---|---|
| FC-01 | **APPROVED** 15% | Versioned `PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT`; fail closed if unbound; never scatter 15% literals; historical amounts not re-rated |
| FC-02 | APPROVED | Preserve gross; discount separate; funding owner required; missing ≠ 0 |
| FC-03 | APPROVED | One-active-agent; cash≠card; separate exposure fields |
| FC-04 | APPROVED | Append-only chargeback; disputed→suspense; fees separate; no trip rewrite |
| FC-05 | APPROVED | Gateway fee independent; default owner Company; never silent deduct driver/agent |

Code: `src/domain/finance/v2/policies/`

## FR sequence

| Phase | Ops | Prep |
|---|---|---|
| FR1 | Materialize accounting snapshot | PREPARED (+ pilot prep doc) |
| FR2 | Settlement V2 create/update | PREPARED (+ pilot prep doc; live apply not executed) |
| FR3 | Reconciliation | PREPARED (+ pilot prep doc; read-only shadow; live verify not executed) |
| FR4 | Settlement approval (lock) | PREPARED (+ pilot prep doc; live apply not executed) |
| FR5 | Execution + payout **preparation** (not live) | PREPARED |
| FR6 | Adjustment / reversal / refund / chargeback | PREPARED |
| FR7 | Reporting / read model (writes=0) | PREPARED |

Specs: `src/application/finance/rollout/FinanceRolloutOperationSpecs.ts`

## Per-operation contract (summary)

Each op defines: preconditions, allowed collections, expected write counts (`production: 0` during prep), idempotency key, audit intent/result, rollback/reversal, forbidden writes, post-write verification.

| Op | Allowed collections | Prep prod writes | Rollback |
|---|---|---|---|
| snapshot.materialize | `finance_accounting_snapshots`, audit | 0 | append-only; adj/reversal |
| settlement.create | `financial_settlements`, audit | 0 | void draft |
| recon.run | `finance_reconciliation_runs`, audit | 0 | append-only compare |
| settlement.lock | `financial_settlements`, audit | 0 | void pre-pay; else reverse+adj |
| payment.prepare | `settlement_payment_intents`, audit | 0 | cancel intent |
| adjustment.* | `finance_adjustments`, audit | 0 | compensating adj |
| payment.reverse / void | payments + settlements, audit | 0 | audited reversal |
| refund.account | `finance_refund_accounting`, audit | 0 | compensating adj |
| chargeback.account | chargeback + adj, audit | 0 | reverse status; trip immutable |
| payout.prepare | `finance_payout_preparations`, audit | 0 | cancel; no provider |

## RBAC

Roles: `super_admin`, `accountant` (finance), `finance_approver`, `country_admin`, `agent_user`, `auditor` / `reporting_viewer` (+ ops_manager for execute/payout).

Permissions (separate):

- view → `finance:read`
- prepare → `settlements:prepare` / `settlements:create`
- approve → `settlements:approve`
- execute settlement → `settlements:execute`
- adjustment / reversal → `finance:adjust`, `finance:adjust_approve`, `settlements:reverse`
- payout → `payouts:prepare`, `payouts:execute`
- export → `reports:export`

## Safety gates

- Verified actor + finance RBAC
- Idempotent writes
- Audit intent/result
- Currency required
- Missing values fail closed (never invent 0)
- Cross-country fail closed
- One-active-agent-per-country
- Historical snapshot immutable
- Corrections via adjustment/reversal only
- FC-01 missing/unapproved binding → `FINANCE_POLICY_UNRESOLVED_FC01`
- No UI Firestore direct writes
- Production gate denies Finance writes while `FINANCE_WRITE_ENABLED=false`

## Operator harness

```bash
# SKIP by default — do NOT run live
PHASE_FINANCE_CONTROLLED_ROLLOUT=1 FINANCE_WRITE_ENABLED=false \
  # offline status only via FinanceControlledRolloutHarness
```

FR1 pilot arm (separate; DO NOT execute in prep):

```bash
FINANCE_FR1_PILOT_APPLY=1 FINANCE_WRITE_ENABLED=true ...
```

## Pilot GO / NO-GO

| Track | Decision |
|---|---|
| F6 policy closure (code/contracts) | **PASS** |
| FR1–FR7 offline preparation | **PREPARED** |
| FC-01 15% versioned config | **APPROVED** |
| First controlled Finance **pilot** live write | Requires synthetic candidate + armed harness — see FR1 prep doc |

Remaining blockers for live write:

1. Safe synthetic/test completed trip candidate (else NO-GO)
2. Explicit armed session: `FINANCE_FR1_PILOT_APPLY=1` + `FINANCE_WRITE_ENABLED=true`
3. Operator ADC IAM on expected principal
4. No live payout / settlement execute until separate GO
