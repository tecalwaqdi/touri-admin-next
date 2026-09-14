# FINANCE FR1 PILOT PREPARATION

**Status:** PREPARED (live apply NOT executed)  
**FC-01:** APPROVED_15_PERCENT (versioned `PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT`)  
**FINANCE_WRITE_ENABLED:** `false` during preparation  
**Production Finance writes this session:** `0`

## Scope

Exactly **ONE** operator-controlled Production Finance pilot candidate:

- FR1 deterministic completed-trip **accounting snapshot**
- Plus exact dependent **audit intent/result** + **idempotency** only
- No settlement execute / payout / refund / chargeback / migration / CF
- No Driver / Agent / Customer writes
- No batch

## Candidate rule

- Prefer **synthetic/test** completed trip
- If none found → **NO-GO** (do not auto-use real financial records)
- APPROVED isolated path: registry fixture
  `admin_next_finance_fr1_order_fixtures/test_adminnext_finance_fr1_completed_001`
  requires `FINANCE_FR1_REGISTRY_PILOT=1` and maps to the **same** Finance canonical input used after order mapping
- Registry is **not** financial SoT / order replacement / real-trip fallback

## Prep checklist (1–14)

1. Identify exact pilot trip  
2. Verify completed/eligible  
3. Verify country/currency  
4. Verify authoritative financial inputs  
5. Verify FC-01 15% resolves from versioned policy  
6. Verify discount treatment (FC-02)  
7. Verify driver amount inputs  
8. Verify agent attribution  
9. Verify no prior snapshot/idempotency  
10. Verify reconciliation preconditions  
11. Calculate exact expected values  
12. Calculate exact expected write counts  
13. Prove Finance RBAC (`finance:read`, `settlements:prepare`)  
14. Prove non-Finance writes forbidden  

## Expected first-apply writes

| Collection | Count |
|---|---|
| `finance_accounting_snapshots` | 1 |
| `finance_audit_events` | 2 |
| `admin_next_cw_idempotency` | 1 |
| order / settlements / drivers / agents / customers | 0 |
| **Total** | **4** |

Rerun → `ALREADY_APPLIED` with **0** additional writes.

## Live harness (DO NOT EXECUTE in prep)

Order-sourced (if a synthetic `order/` doc exists):

```bash
FINANCE_FR1_PILOT_APPLY=1 \
  FINANCE_WRITE_ENABLED=true \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/finance-fr1-pilot-apply.test.ts
```

Registry-sourced (APPROVED isolated fixture):

```bash
FINANCE_FR1_PILOT_APPLY=1 \
  FINANCE_FR1_REGISTRY_PILOT=1 \
  FINANCE_WRITE_ENABLED=true \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  SOURCE=registry \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/finance-fr1-pilot-apply.test.ts
```

Cleanup:

```bash
unset FINANCE_FR1_PILOT_APPLY FINANCE_FR1_REGISTRY_PILOT FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN && \
  export FINANCE_WRITE_ENABLED=false && \
  export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false
```

## Code

- Policy: `src/domain/finance/v2/policies/PlatformCommissionPolicy.ts`
- Pilot: `src/application/finance/pilot/`
- Registry fixture: `docs/FINANCE_FR1_SYNTHETIC_FIXTURE_PREPARATION.md`
- Live harness (SKIP default): `src/test/live/finance-fr1-pilot-apply.test.ts`