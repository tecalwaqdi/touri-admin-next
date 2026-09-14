# TOURI TAXI ADMIN NEXT
## PHASE 3.6 FINANCIAL POLICY FREEZE REPORT

```
TOURI TAXI ADMIN NEXT
PHASE 3.6 FINANCIAL POLICY FREEZE REPORT

1. Overall status
COMPLETE for Phase 3.6 scope only (Financial Policy Freeze & Canonicalization).
Work confined to /Users/ventura/touri-admin-next. Legacy unmodified.
No Production Firebase access. No Phase 4 Production adapters.
Production Read/Write remain DISABLED. Recommendation: NO-GO for Phase 4 DESIGN ONLY
(readiness 80/100 < 85; Critical SAFE READ unknowns = 0).

2. Legacy unchanged
Compared git status --short and git diff --stat on /Users/ventura/ara-ban
to Phase 3.6 before/after baseline snapshots under docs/legacy-baseline/.
No Agent-caused Legacy changes. Pre-existing dirty Legacy left untouched.

3. Production access state
No Admin SDK, no credentials, no Firestore reads/writes, no migrations.
PRODUCTION_READ_ENABLED=false, PRODUCTION_WRITE_ENABLED=false,
GLOBAL_PRODUCTION_WRITE_ENABLED=false, FINANCE_WRITE_ENABLED=false,
DRIVER_WRITE_ENABLED=false, AGENT_WRITE_ENABLED=false (.env.local + tests).

4. Tests before
88 passed / 88

5. Tests after
113 passed / 113 (+25 Phase 3.6 financial policy / historical read / safety)

6. FC-01 resolution for READ
CLOSED for SAFE READ amount mapping: platformCommissionAmount = persisted total_app
(high). Historical rate = null (unknown) — never hardcode 15. Future Policy Decision
for Production rate remains OPEN (draft FinancialPolicy, productionApproved=false).

7. FC-02 resolution for READ
CLOSED for SAFE READ display: persisted total_mndob displayable; DiscountTreatmentPolicy
status=unresolved, productionApproved=false; discount NOT auto-applied as driver-net
reduction; conflict kept as warning. Remains Future Policy / SETTLEMENT blocker.

8. FC-05 resolution for READ
CLOSED for SAFE READ trip display: missing snapshot → agentId=null,
agentAttributionStatus=unknown_historical (never current country agent).
BLOCKS agent settlement/attribution (AGENT_ATTRIBUTION_UNKNOWN), not trip display.

9. FC-07 resolution for READ
CLOSED for SAFE READ: chargebackStatus=not_represented, chargebackAmount=null
(NEVER 0). ChargebackPolicy draft only; no gateway. Blocks claiming chargebacks=0.

10. Incomplete-to-zero resolution
RESOLVED: every financial field carries value + availabilityStatus + confidence +
source + warnings. Statuses: available|derived|missing|unknown|not_represented|conflicting.
Unit tests forbid null/undefined/missing/NaN → 0 via assertIncompleteNotZero.

11. Historical platform commission rule
If order.total_app present+valid → platformCommissionAmount = persisted total_app.
Do NOT recalculate old trips with current %. If missing → null + incomplete.
Historical rate = null unless snapshotted/proven.

12. Future platform commission state
Draft FinancialPolicy / PlatformCommissionPolicyDraft; productionApproved=false;
status=draft; human_approval_required for Production rate schedule.

13. Historical driver net rule
total_mndob present → primary persisted source. Missing → optional proven Legacy
formula as derived with derivedFrom/formulaId/mappingVersion/warnings;
derived NOT settlement-eligible without explicit policy.

14. Historical agent attribution rule
Snapshot exists → use it. Missing → agentId=null, unknown_historical.
Future design fields: agentIdSnapshot, agentCommissionRateSnapshot,
agentCommissionAmountSnapshot, agentPolicyVersion. Rate-only ≠ invent amount.

15. Historical VAT rule
total_vat present → read stored amount; do NOT recompute with current country VAT.
vatRateAtTrip=null if not historically proven.

16. Future VAT policy state
VatPolicy draft (rate, calculationMode, taxBaseDefinition, inclusiveOrExclusive,
roundingMode, effectiveFrom, countryId, version); productionApproved=false.

17. Chargeback rule
Lifecycle NOT FOUND → not_represented + amount null (never 0). Domain types only.

18. Canonical financial availability statuses
available | derived | missing | unknown | not_represented | conflicting

19. Display safety rules
isSafeForDisplay may be true with incomplete agent/rate/chargeback; majors present
and no invented zeros required for display-safe projection.

20. Settlement safety rules
Critical missing|unknown|conflicting block settlement with reason codes:
AGENT_ATTRIBUTION_UNKNOWN, DRIVER_NET_UNRESOLVED, COMMISSION_CONFLICT,
VAT_POLICY_UNRESOLVED, CHARGEBACK_NOT_REPRESENTED, INCOMPLETE_MAJORS, etc.

21. Accounting safety rules
Stricter than settlement: also blocked by unresolved discount treatment,
commission rate conflict, chargeback not_represented, VAT policy unresolved.

22. Canonical field classification
READ_SAFE | READ_WITH_WARNING | DO_NOT_EXPOSE_YET with sensitivity
public_admin | operational_sensitive | financial_sensitive | identity_sensitive.
See FinancialFieldClassification.ts + CANONICAL_FINANCIAL_FIELD_DECISIONS.md.

23. Financial Read blockers remaining
Critical SAFE READ: 0.
Residual non-critical: gateway fee / refund / adjustment remain DO_NOT_EXPOSE_YET
(null, not invented).

24. Future financial policy decisions remaining
Platform rate (FC-01 future), DiscountTreatment (FC-02 future), VAT inclusive/rate,
agent settlement inclusion, chargeback gateway, gateway fee schedule.

25. Auth blockers remaining
No live verifyIdToken; claim sync not wired; partner/transport unmapped deny;
mock login UI must not ship. x-user-id rejection enforced outside development.

26. Dependency blockers remaining
None as PHASE_4_BLOCKER for runtime. npm audit: critical/high are vitest (dev) and
postcss (via Next) — formally ACCEPTED per DEPENDENCY_PRODUCTION_GATE.md.
No forced upgrades.

27. Tests passed
113

28. Tests failed
NONE

29. Typecheck
PASS (recorded in final verification)

30. Build
PASS (recorded in final verification)

31. Mapping readiness before
71/100

32. Mapping readiness after
80/100
(Trips13 + Driver8 + Customer4 + Agent9 + Geo3 + Fin22 + Auth7 + Sec6 + CF8)

33. Critical blockers for SAFE READ
0

34. Critical blockers for SETTLEMENT
≥6 (platform rate policy, discount treatment, agent attribution gaps,
derived driver net, chargeback accounting, VAT policy, …)

35. Production Read
EXPECTED: DISABLED
ACTUAL: DISABLED (PRODUCTION_READ_ENABLED=false)

36. Production Write
EXPECTED: DISABLED
ACTUAL: DISABLED (all write flags false)

37. Recommendation
NO-GO for Phase 4 DESIGN ONLY
(readiness 80 < 85; SAFE READ unknowns cleared; write disabled; no adapter built)

38. Exact confirmation:
"Legacy source files were not modified."

39. Exact confirmation:
"Production Firebase was not accessed."

40. Exact confirmation:
"Production read remains disabled."

41. Exact confirmation:
"Production write remains disabled."
```

## Artifacts (Admin Next only)

### Docs under `docs/legacy-mapping/`
- CANONICAL_FINANCIAL_FIELD_DECISIONS.md (new)
- FINANCIAL_POLICY_DECISION_REGISTRY.md (new)
- FINANCIAL_PRODUCTION_READ_BLOCKERS.md (updated — SAFE READ vs SETTLEMENT)
- PHASE_3_6_READINESS.md (new)
- LEGACY_TO_CANONICAL_FINANCIAL_READ_CONTRACT.md (updated)
- PLATFORM_COMMISSION_TRACE.md / VAT_TRACE.md / DRIVER_NET_TRACE.md /
  AGENT_FINANCIAL_TRACE.md / ONLINE_PAYMENT_TRACE.md (Phase 3.6 appendices)
- `docs/SYNTHETIC_FINANCIAL_POLICY.md` (distinction note)
- `docs/PHASE_3_6_REPORT.md` (this file)

### Code
- `src/domain/canonical/FinancialPolicy.ts`
- `src/domain/canonical/VatPolicy.ts`
- `src/domain/canonical/ChargebackPolicy.ts`
- `src/domain/canonical/DiscountTreatmentPolicy.ts`
- `src/domain/canonical/CanonicalFinancialSourcePriorityPolicy.ts`
- `src/domain/canonical/FinancialFieldClassification.ts`
- `src/domain/canonical/FinancialFieldSafety.ts`
- Extended: FieldProvenance, CanonicalReadModels, mapLegacyFinancialSnapshot
- `FinancialCalculationService` — rates only from policy provider; no hardcoded 0.15/15
- Tests: `src/test/unit/phase36-financial-policy.test.ts`

## STOP

No Production Adapter. No Firebase connect. No Production data fetch.
No Phase 4 work. Human review required before Phase 4 DESIGN ONLY.
