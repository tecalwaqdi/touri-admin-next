# TOURI TAXI ADMIN NEXT
## PHASE 3.5 BLOCKER RESOLUTION REPORT

```
TOURI TAXI ADMIN NEXT
PHASE 3.5 BLOCKER RESOLUTION REPORT

1. Overall status
COMPLETE for Phase 3.5 scope only (blocker resolution + canonical contract).
Work confined to /Users/ventura/touri-admin-next. Legacy unmodified.
No Production Firebase access. No Phase 4 Production adapters.
Production Read/Write remain DISABLED. Recommendation: NO-GO for Phase 4 DESIGN ONLY.

2. Legacy unchanged verification
Compared git status --short and git diff --stat on /Users/ventura/ara-ban
to docs/legacy-baseline/*-after.txt (Phase 3 post-check). Diff empty.
Snapshots saved: docs/legacy-baseline/legacy-git-status-phase35.txt,
legacy-diff-stat-phase35.txt. Pre-existing dirty Legacy left untouched.

3. Production access verification
No Admin SDK, no credentials, no Firestore reads/writes, no migrations.
PRODUCTION_READ_ENABLED=false, PRODUCTION_WRITE_ENABLED=false,
GLOBAL_PRODUCTION_WRITE_ENABLED=false (.env.local + tests).

4. Tests before
66 passed / 66 (Phase 3 baseline)

5. Tests after
88 passed / 88 (+22 Phase 3.5 canonical/auth/differential)

6. Platform commission conclusion
Observed Legacy Behavior: CF verifiedBookingAmount + payment-api default
hardcode percentOf(baseFare, 15); amount persisted as order.total_app.
NOT adopted as Production policy. app_commission_percent AMBIGUOUS (FC-01 / C).
Evidence: ngenius_payments.js; booking.ts; PLATFORM_COMMISSION_TRACE.md

7. VAT conclusion
Write path PROVEN: countries.isvat + countries.vat % of base → order.total_vat.
Rate not on order; inclusive UX UNRESOLVED. VAT_TRACE.md

8. Driver net conclusion
Authoritative candidate: persisted order.total_mndob = base−app−vat (CF).
V2 may derive; discount cases → FC-02 Conflict. Never invent 0.
DRIVER_NET_TRACE.md

9. Agent finance conclusion
Agent_total % of platform fee; FIN-9 snapshot on new orders; 1:1 country lock proven.
Historical attribution gaps remain (FC-05). Settlement inclusion of agent due UNRESOLVED.
AGENT_FINANCIAL_TRACE.md + AGENT_ONE_TO_ONE_EVIDENCE.md

10. Cash flow conclusion
Driver holds cash / owes company: Observed+Derived (V2 signedCash).
Cash to/held by/remitted by agent: Not represented. Remittance via settlement/wallet Observed.
LEGACY_CASH_FLOW.md (updated)

11. Online payment conclusion
N-Genius create/finalize/webhook Proven; webhook duplicate protection Proven;
refund Proven; gateway fee NOT FOUND; chargeback NOT FOUND (FC-07).
ONLINE_PAYMENT_TRACE.md

12. Settlement V2 conclusion
FOUND operational SM (draft/lock/settle/void/payments/idempotency).
NOT classic CoA GL. vs Admin Next synthetic: Adaptable with Conflicts.
SETTLEMENTS_V2_AUDIT.md + SETTLEMENT_V2_VS_ADMIN_NEXT.md

13. Ledger conclusion
Classic GL NOT FOUND. Admin Next synthetic ledger remains productionApproved=false.
CanonicalFinancialTripReadModel.isLedger = false (contract).

14. Canonical Financial Read Contract
Documented + implemented mapper (interfaces only, no Firestore):
LEGACY_TO_CANONICAL_FINANCIAL_READ_CONTRACT.md
src/domain/canonical/*

15. Trip mapping confidence
High for proven status_code set; unknown → unmapped (never nearest).
Residual dual-write halh_* risk. Score contribution: Trips 13/15.

16. Driver mapping confidence
High for five orthogonal axes + user collection; net mapping clarified.
Driver 8/10.

17. Agent mapping confidence
High for 1:1 lock + Isagent; medium for finance snapshot; low historical.
Agent 8/10.

18. Geography mapping confidence
Medium plan only (City Scope Contract design). Geography 3/5.

19. Auth production design
Documented Browser→Firebase Auth→ID Token→verifyIdToken→claims→RBAC→Scope→Repo.
FakeIdTokenVerifier + fail-closed tests. NOT connected to production Firebase.
PRODUCTION_AUTH_DESIGN.md

20. Authorization gaps
App vs CF vs Rules vs Admin Next roles documented; partner/transport unmapped deny;
rules drift residual. SECURITY_AUTHORIZATION_GAPS.md

21. High confidence financial fields (Class A candidates)
order.total, total_mndob2, total_app (amount), total_vat (amount), total_mndob (when present),
payment_status lifecycle, FIN-9 agent_amount when present, settlement header amounts.

22. Derived financial fields (Class B)
driver deductions (app+vat), cash/online positions (V2), some exposure outstanding,
V2 derived driverNet when stored missing (with warnings).

23. Conflicting financial fields (Class C)
Platform rate 15 vs app_commission_percent (FC-01); driver net base vs total (FC-02);
V1 misleading names (FC-03); multi-engine (FC-09); wallet aliases (FC-06);
settlement status vocabulary vs Admin Next synthetic.

24. Missing financial fields (Class D)
Gateway fee on trip pipeline; historical agent snapshot; agent cash remittance;
some ksm/currency on old orders.

25. Unknown financial fields (Class E)
VAT rate on trip without country join; chargeback lifecycle; refund amount on order snapshot;
adjustment linkage to trip read model; agent settlement inclusion; final Production policy rates.

26. Remaining financial blockers
13 listed in FINANCIAL_PRODUCTION_READ_BLOCKERS.md; 5 Critical unknowns remain
(FC-01 policy, FC-02 policy, FC-05 historical agent, FC-07 chargeback, incomplete→zero risk).

27. Remaining auth blockers
No live verifyIdToken; claim sync not wired; partner/transport unmapped;
mock login UI must not ship. x-user-id rejection enforced.

28. Remaining geography blockers
Alias inventory completeness unknown; mkan/city dual identity; matching rules design-only.

29. Legacy synthetic fixtures created
docs/legacy-mapping/legacy-financial-fixtures.json (FIN-FIX-001..006 + FIN-TRACE-001..004)
Derived from Observed source formulas — NOT production data.

30. Differential tests
phase35-canonical-contract.test.ts: Observed formula majors vs Canonical mapping;
discount≠net reduction; agent round(platform*rate/100).

31. Total tests passed
88

32. Tests failed
NONE

33. Typecheck
PASS

34. Build
PASS

35. Production Read state
EXPECTED: DISABLED
ACTUAL: DISABLED (PRODUCTION_READ_ENABLED=false)

36. Production Write state
EXPECTED: DISABLED
ACTUAL: DISABLED (all write flags false)

37. Mapping readiness score before
43/100

38. Mapping readiness score after
71/100
(Trips13 + Driver8 + Customer4 + Agent8 + Geo3 + Fin14 + Auth7 + Sec6 + CF8)

39. Critical unknown mappings count
5

40. Recommendation:
NO-GO for PHASE 4 DESIGN ONLY
(requires readiness >= 85, critical financial unknowns = 0, and human review of this report)

41. Exact confirmation:
"Legacy source files were not modified."

42. Exact confirmation:
"Production Firebase was not accessed."

43. Exact confirmation:
"Production read remains disabled."

44. Exact confirmation:
"Production write remains disabled."
```

## Artifacts (Admin Next only)

Under `docs/legacy-mapping/`:
- FINANCIAL_SOURCE_OF_TRUTH_MATRIX.md
- PLATFORM_COMMISSION_TRACE.md
- VAT_TRACE.md
- DRIVER_NET_TRACE.md
- AGENT_FINANCIAL_TRACE.md
- LEGACY_CASH_FLOW.md (updated)
- ONLINE_PAYMENT_TRACE.md
- SETTLEMENTS_V2_AUDIT.md
- SETTLEMENT_V2_VS_ADMIN_NEXT.md
- LEGACY_TO_CANONICAL_FINANCIAL_READ_CONTRACT.md
- GEOGRAPHY_CANONICALIZATION_PLAN.md
- AGENT_ONE_TO_ONE_EVIDENCE.md
- PRODUCTION_AUTH_DESIGN.md
- SECURITY_AUTHORIZATION_GAPS.md
- FINANCIAL_PRODUCTION_READ_BLOCKERS.md
- PHASE_3_5_READINESS.md
- legacy-financial-fixtures.json
- AUTH_PRODUCTION_BLOCKERS.md (updated)

Code (interfaces / Fake auth / mapping / tests only):
- `src/domain/canonical/*`
- `src/domain/auth/ProductionAuthDesign.ts`
- `src/test/unit/phase35-canonical-contract.test.ts`

## STOP

No Production Adapter. No Firebase connect. No Production data fetch.
Human review of this report is required before any Phase 4 DESIGN ONLY work.
