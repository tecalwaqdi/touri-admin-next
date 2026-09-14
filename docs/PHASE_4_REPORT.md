# TOURI TAXI ADMIN NEXT
# PHASE 4 CONTROLLED PRODUCTION READ DESIGN REPORT

```
TOURI TAXI ADMIN NEXT
PHASE 4 CONTROLLED PRODUCTION READ DESIGN REPORT

1. Overall status
DESIGN ONLY complete. Interfaces, Disabled/Fake stubs, docs, and contract tests landed.
No Production Firebase connection, credentials, SDK init, or real Production adapter.
Flags remain false. Ready for Phase 4A IMPLEMENTATION gate review.

2. Legacy verification
Before snapshots saved:
  docs/legacy-baseline/legacy-status-phase4-before.txt
  docs/legacy-baseline/legacy-diff-phase4-before.txt
After comparison: status_diff=0, diffstat_diff=0 — no concurrent Legacy drift during Phase 4 design.
Admin Next did not modify ara-ban / Legacy sources (including functions/index.js,
mkan_list_visibility*, visibility tests, or pre-existing dirty/untracked Legacy files).

3. Production access verification
No Firebase Admin SDK import/init. No service account. No Firestore read/write.
UnimplementedFirebaseAdminProductionIdentityVerifier always returns verifier_unavailable.
FakeProductionReadRepositories are in-memory only.
PRODUCTION_READ_ENABLED=false; PRODUCTION_READ_MODE=disabled.

4. Tests before
25 files / 143 tests passed.

5. Tests after
26 files / 175 tests passed (+32 Phase 4 design contract tests).
typecheck passed. build passed.

6. Proposed Production Read architecture
Browser → Admin Next Web → Verified ID Token → Backend → Identity Verification →
RBAC → Scope → Read Policy → Resource-Specific Production Repository →
Legacy Mapper → Canonical Read Model → Field Redaction → Response
(sourceEnvironment=production, sourceSystem=legacy, readMode=shadow).
NO Browser → Firestore.

7. Backend boundary
Backend is sole authority. UI must not import @/infrastructure/production or firebase-admin.
Resource-specific APIs only; generic collection query forbidden.
DI: createDevelopmentContainer / createShadowReadContainer only.

8. Identity verification design
ProductionIdentityVerifier (existing) + FakeProductionIdentityVerifier.
FirebaseAdminProductionIdentityVerifier planned (DESIGN_ONLY_NOT_IMPLEMENTED):
token/issuer/audience/expiration/disabled/claims normalization.
Unimplemented stub fail-closed. AUTH_MODE=verified_token required for staging/production.

9. Claims/RBAC design
Verified Identity → Legacy Claim Mapping (AUTH_CLAIM_MAPPING_TABLE) → Role → Scope.
Unknown / partner / transport_manager → DENY (≠ viewer).
Super Admin only via verified claims.super_admin.

10. Scope enforcement design
buildServerSideScopeFilter + enforceReadScope.
Client countryId/agentId/global=true cannot expand; DENY or force authorized scope.
Request cannot broaden country_admin / agent scope. Tests cover escalation denials.

11. Initial resources
countries, cities, trips, drivers, agents, customer summary (masked).

12. Initial excluded resources
settlement execution, ledger, financial writes, driver approval, agent changes,
customer mods, refund/chargeback execution, Settlement V2, export (first 4A).

13. Collection allowlist
ALLOW: countries, cities, order, user (via resource repos).
DENY default + explicit: settlements, settlement_v2, ledger, journal,
finance_controls, refunds, chargebacks, payment_gateway, admin_users_mutations.
Code: CollectionAllowlist.ts + docs/phase4/PRODUCTION_READ_COLLECTION_ALLOWLIST.md

14. Field allowlist
Operational allowlist + financial classification allowlist.
Unknown fields denied. Code: FieldAllowlist.ts + PRODUCTION_READ_FIELD_ALLOWLIST.md

15. Financial read scope
READ_SAFE / READ_WITH_WARNING only (4A-7).
Blocked DO_NOT_EXPOSE_YET: refundAmount, chargebackAmount, gatewayFee, adjustmentAmount.

16. PII policy
Default REDACTED (masked). Full requires customers:read_pii / drivers:read_pii.
Audit event sensitive_field_read (no raw values).

17. Query safety
MAX_PAGE_SIZE=100; query budget; no unlimited/all/recursive scans;
customers name search unsupported initially (no full collection scan).

18. Pagination design
Cursor pagination required; offset/pageNumber heavy pagination rejected.
Trip list default window last 7 days; max configurable 31 days.

19. Index requirements
Documented as existing | likely existing | required future | unknown.
NO index deploy in Phase 4. See PRODUCTION_READ_INDEX_REQUIREMENTS.md

20. Mapping versioning
LEGACY_MAPPING_VERSION=legacy-map-v1.
sourceSchemaVersion=unknown when none.
sourceVersion + mappingVersion stamped on envelopes.

21. Mapping warning handling
mappingWarnings[] preserved; mappingConfidence carried.
Mismatch → MAPPING_MISMATCH; never change Legacy.

22. Shadow container design
createShadowReadContainer(): Fake verifier + Fake production read repos +
DisabledWriteRepository + disabled settlement/ledger/driver/agent mutation ports +
ShadowComparisonService + observability + circuit breaker.
productionWriteRepos=null. No createProductionWriteContainer.

23. Write isolation design
Hard DisabledWriteRepository → PRODUCTION_WRITE_DISABLED.
Shadow forbids write flags true in env validation.
Build-time: forbidden factory name assert; mutation trap tests.
Synthetic mutations remain on in-memory repos only.

24. Mutation route inventory
Documented in ADMIN_NEXT_MUTATION_ROUTE_INVENTORY.md + MutationRouteInventory.ts.
Mutation routes (settlements actions, agent activate, export) → reject/hide;
future trap maps all to PRODUCTION_WRITE_DISABLED.

25. Kill switch design
PRODUCTION_READ_ENABLED=false rejects all Production repo calls
(ProductionReadDisabledError / KILL_SWITCH gate).

26. Rollback design
Flip PRODUCTION_READ_ENABLED=false (+ optional READ_MODE=disabled).
No Legacy/customer/driver/DB restore. See ROLLBACK_SPEC.md.

27. Canary/pilot design
Allowlisted admins / pilot role; prefer read-only auditor without finance approval,
driver actions, or user management. See PHASE_4A_GO_LIVE_CHECKLIST.md.

28. Shadow UI design
Banner: PRODUCTION SHADOW — READ ONLY / وضع قراءة تجريبي — بيانات إنتاج — بدون تعديل.
Nav allow: Dashboard (limited), Trips, Drivers, Agents, Customers summary,
Geography, Mapping Health.
Hide: Settlement execution, Finance approval, User/Settings mutations,
Driver approval, Agent assignment, Refunds, Export.
Prefer not rendering mutation actions. Never mix synthetic+production;
degraded shows "Production data unavailable".

29. Comparison design
ShadowComparisonService: counts exact; money exact minor-unit; status canonical.
Mismatch → MAPPING_MISMATCH. No Production wire. SHADOW_COMPARISON_SPEC.md

30. Observability design
Events: production_read_request/denied, scope_denied, pii_redacted,
sensitive_field_read, mapping_warning/failure, shadow_comparison_mismatch,
kill_switch_triggered, circuit_breaker_open. No sensitive logs.
OBSERVABILITY_SPEC.md

31. Circuit breaker design
Failure threshold; ignore auth_deny; open → CIRCUIT_OPEN +
"Production data unavailable". Limited retries; never retry auth deny.
Timeouts design: 8s / maxRetries 1.

32. Failure/degraded mode
Admin Next failure must not affect Legacy/customer/driver/CFs.
Degraded: unavailable message — no silent synthetic fallback on Production screens.

33. Threat model findings
Covered: auth spoof, scope escalation, PII, generic query, DoS, token replay,
stale claims, mapping corruption, env mix-up, synthetic/production mix,
accidental write. Mitigations documented; residual medium until live Admin SDK
+ short token TTL. PHASE_4_READ_THREAT_MODEL.md reviewed.

34. Credential requirements
Least privilege read-only dedicated identity; Secret Manager; no commit;
rotation; env separation; access audit. NO real credential in this phase.
PRODUCTION_CREDENTIAL_REQUIREMENTS.md

35. Environment fingerprint design
expectedProjectId / expectedEnvironment; mismatch FAIL STARTUP / gate DENY.
EXPECTED_PROJECT_ID + EXPECTED_ENVIRONMENT env fields (default empty/disabled path).

36. Production read multi-gate
PRODUCTION_READ_ENABLED=true AND APP_ENV=production AND AUTH_MODE=verified_token
AND EXPECTED_PROJECT_ID matches AND all WRITE flags false AND
PRODUCTION_READ_MODE=shadow else DENY. Read never coupled to enabling writes.

37. Tests passed
175 (including 32 Phase 4 design).

38. Tests failed
0

39. Typecheck
PASSED (tsc --noEmit)

40. Build
PASSED (next build)

41. Phase 4A Implementation Readiness Score
94/100
  Auth 14/15 (design+fake complete; live Admin SDK deferred to 4A)
  Authorization-scope 15/15
  Resource contracts 15/15
  Field safety 10/10
  PII 10/10
  Kill-rollback 10/10
  Observability 10/10
  Query-index 9/10 (index status partly unknown — documented, no deploy)
  Threat model 5/5

42. Critical design blockers
0

43. Settlement blockers
EXPECTED: unresolved
ACTUAL: unresolved (Settlement V2 / execution OUT OF INITIAL SCOPE; remains BLOCKED)

44. Accounting blockers
EXPECTED: unresolved
ACTUAL: unresolved (ledger / financial writes / DO_NOT_EXPOSE_YET remain BLOCKED)

45. Production Read
EXPECTED: DISABLED
ACTUAL: DISABLED (PRODUCTION_READ_ENABLED=false, PRODUCTION_READ_MODE=disabled)

46. Production Write
EXPECTED: DISABLED
ACTUAL: DISABLED (all write flags false; DisabledWriteRepository)

47. Recommendation:
GO for PHASE 4A IMPLEMENTATION
(≥90, critical design blockers=0, write impossible by design, allowlists complete,
auth design complete, PII defaults safe, kill/rollback complete, threat model reviewed).
Settlement/Accounting remain BLOCKED — 4A readiness ≠ settlement readiness.

48. Exact confirmation:
"Legacy source files were not modified by Phase 4."

49. Exact confirmation:
"Production Firebase was not accessed."

50. Exact confirmation:
"No Production adapter was created."

51. Exact confirmation:
"Production read remains disabled."

52. Exact confirmation:
"Production write remains disabled."
```

## Artifacts

### Docs (`docs/phase4/`)
- PHASE_4_ARCHITECTURE.md
- PHASE_4A_ROLLOUT_PLAN.md
- PRODUCTION_READ_FIELD_ALLOWLIST.md
- PRODUCTION_READ_COLLECTION_ALLOWLIST.md
- PRODUCTION_READ_INDEX_REQUIREMENTS.md
- ADMIN_NEXT_MUTATION_ROUTE_INVENTORY.md
- PHASE_4_READ_THREAT_MODEL.md
- PHASE_4_SECURITY_CHECKLIST.md
- PHASE_4A_GO_LIVE_CHECKLIST.md
- PRODUCTION_CREDENTIAL_REQUIREMENTS.md
- SHADOW_COMPARISON_SPEC.md
- OBSERVABILITY_SPEC.md
- ROLLBACK_SPEC.md

### Code (interfaces / fakes / disabled only)
- `src/domain/production-read/constants.ts`
- `src/infrastructure/production/contracts/*`
- `src/infrastructure/production/DisabledWriteRepository.ts`
- `src/infrastructure/production/ProductionReadGate.ts`
- `src/infrastructure/production/container/createContainers.ts`
- `src/infrastructure/production/fakes/FakeProductionReadRepositories.ts`
- `src/infrastructure/production/ShadowComparisonService.ts`
- `src/infrastructure/production/ObservabilityEvents.ts`
- `src/infrastructure/production/CircuitBreakerDesign.ts`
- `src/infrastructure/production/MutationRouteInventory.ts`
- `src/infrastructure/production/ArchitectureBoundary.ts`
- `src/test/unit/phase4-design.test.ts`

### Rollout (design)
4A-0 local fake → 4A-1 prod auth only → 4A-2 geo → 4A-3 trips window →
4A-4 drivers → 4A-5 agents → 4A-6 customer masked → 4A-7 safe financial fields.
