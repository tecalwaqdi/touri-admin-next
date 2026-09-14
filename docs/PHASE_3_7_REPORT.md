# TOURI TAXI ADMIN NEXT
## PHASE 3.7 READ-ONLY READINESS REPORT

```
TOURI TAXI ADMIN NEXT
PHASE 3.7 READ-ONLY READINESS REPORT

1. Overall status
COMPLETE for Phase 3.7 scope only (Auth + Geography + Security + Mapping Completion).
Work confined to /Users/ventura/touri-admin-next. Legacy not modified by this agent.
No Production Firebase access. No Phase 4 Production adapters / credentials.
Production Read/Write remain DISABLED.
Read-only Production Readiness 91/100; Critical SAFE READ blockers = 0.
Recommendation: GO for PHASE 4 DESIGN ONLY (not production-ready; no adapter built).

2. Legacy unchanged
Compared git status --short and git diff --stat on /Users/ventura/ara-ban
to Phase 3.7 before/after snapshots under docs/legacy-baseline/.
This agent made zero Legacy edits. Concurrent unrelated Legacy dirty/untracked drift
appeared during the session (functions/index.js, mkan_list_visibility*, visibility test)
and was not introduced by Admin Next Phase 3.7 work.

3. Production access state
No Admin SDK, no credentials, no Firestore reads/writes, no CF/rules deploy, no migration.
PRODUCTION_READ_ENABLED=false, PRODUCTION_WRITE_ENABLED=false,
GLOBAL_PRODUCTION_WRITE_ENABLED=false, FINANCE_WRITE_ENABLED=false,
DRIVER_WRITE_ENABLED=false, AGENT_WRITE_ENABLED=false (.env*.example + env defaults + tests).

4. Tests before
113 passed / 113

5. Tests after
143 passed / 143 (+30 Phase 3.7 readiness)

6. Production Identity contract
ProductionIdentityVerifier.verify(token) → VerifiedIdentity
(uid, email, emailVerified, disabled, claims, issuedAt, expiresAt, authTime, issuer, audience).
FakeProductionIdentityVerifier for tests ONLY — no live Firebase.

7. AUTH_MODE enforcement
AUTH_MODE=mock|verified_token. Startup Guard via envSchema + assertAuthModeAllowed.
mock allowed only development; staging/production require verified_token.

8. Mock auth staging/production protection
ENFORCED: loadEnv throws if AUTH_MODE=mock under staging/production.
apiAuth rejects x-user-id / x-role / x-country / x-agent / mock bearer outside development.
.env.staging.example + .env.production.example use AUTH_MODE=verified_token.

9. Legacy claims mapping
LEGACY_CLAIMS_TO_ADMIN_NEXT_MAPPING.md + AUTH_CLAIM_MAPPING_TABLE
(evidence: panel_claims.js). Super Admin global ONLY via verified claims.super_admin
(Legacy derives from isAdmin/rule1) — never from browser isAdmin/x-role.

10. Unknown claims handling
unknown claim ≠ admin; unknown role ≠ viewer; missing scope ≠ global → always DENY.

11. Country Admin scope
role country_admin + countryId required else DENY.

12. Agent User scope
role agent_user + agentId + countryId + agent-belongs-to-country domain check
(FakeAgentCountryMembershipChecker) else DENY.

13. Unsupported legacy roles
partner / transport_manager → unsupported_legacy_role → DENY (no invented roles).

14. Auth readiness
Contract + fail-closed tests + AUTH_MODE guard complete; live Firebase verify NOT wired
(expected for 3.7). AUTH_READINESS_MATRIX.md documented.

15. Geography canonicalization
IDs are identity; names not primary IDs. CountryCanonicalization + CityAliasResolver +
CrossCityScope. GEOGRAPHY_CANONICALIZATION_PLAN updated.

16. Country mapping
Evidence-backed table from toury_country_registry (SA/KG/RU/UZ/ES/MA/PT/TN/ID/MY/IN).
iso3 null when unproven. Unmapped → unmapped status.

17. City alias mapping
docs/legacy-mapping/legacy-city-aliases.json from admin_geo_aliases.dart evidence only.

18. Ambiguous city handling
Multiple targets → AMBIGUOUS_CITY, cityId=null, no auto-pick. City-scope ops blocked.

19. Cross-city mismatch handling
tripCity ≠ driverCity → scopeConsistencyStatus=cross_city + displayMismatch;
NEVER relocate trip/driver/city.

20. Customer mapping
CanonicalCustomerReadContract: customerId, name, phone, email, verification, country,
city, blocked, createdAt, lastActivity (+ CanonicalCustomerReadModel extended).

21. PII classification
phone/email/identifiers = identity_sensitive. Permissions customers:read,
customers:read_pii, drivers:read_pii. customers:read does NOT imply full phone/email.

22. PII masking
maskPhone → 05******12 pattern; maskEmail → u***@example.com; null/unknown preserved.

23. Trip status source priority
TRIP_STATUS_SOURCE_PRIORITY.md + TripStatusSourcePriority.ts —
status_code > halh_order > halh_text > halh (evidence-backed).

24. Unknown trip status handling
→ unmapped; isDisplayable=true; isSafeForOperationalAction=false.

25. Driver canonical statuses
Six orthogonal axes (registration/approval/account/availability/presence/document)
with source/confidence/unknownBehavior — one field never represents all.

26. Timestamp mapping
TimestampMapper: UTC internal; timezone display; Timestamp/ISO/ms/seconds handled;
unprovable local unlabeled → null+warning when assumeLocalUnlabeled.

27. Currency mapping
order > settlement > country_doc > iso fallback (AdminCurrency.fallbackByIso).
Missing order currency may derive from country with confidence=derived.

28. Currency conflicts
currencyConflict=true on mismatch; no FX conversion; order currency preferred for display.

29. Read authorization contract
READ_AUTHORIZATION_CONTRACT.md — Backend authority; no generic collection read;
ReadQuery<TFilter,TResult>; pipeline verify→role→scope→validate→server filter→query→redact→return.

30. Server-side scope enforcement design
buildServerSideScopeFilter + applyServerSideScopeFilter; never query-all then client filter.

31. Pagination safety
limit required; MAX_PAGE_SIZE default 100; unbounded forbidden (tested).

32. Sensitive field registry
SENSITIVE_FIELD_REGISTRY.md + SensitiveFieldRegistry.ts.

33. Financial fields allowed for Read
READ_SAFE / READ_WITH_WARNING per Phase 3.6 classification (grossFare, finalCustomerAmount,
vatAmount, platformCommissionAmount, driverNet, … with warnings where applicable).

34. Financial fields blocked from Read
DO_NOT_EXPOSE_YET: refundAmount, chargebackAmount, gatewayFee, adjustmentAmount — redacted/blocked.

35. Proposed Phase 4 scope
PHASE_4_PROPOSED_READ_SCOPE.md — countries/cities/trips/drivers/agents/customer summary;
financial READ_SAFE/WARNING only; Settlement V2 out; no writes.

36. Phase 4 kill conditions
PHASE_4_KILL_CONDITIONS.md (auth fail-open, scope leak, PII leak, DO_NOT_EXPOSE exposure, etc.).

37. Shadow comparison design
PHASE_4_SHADOW_MODE_DESIGN.md — Legacy SoT; counts exact; money exact minor-unit;
no FX tolerance; safe fields only.

38. Mapping health design
/admin-next-health/mapping — fixtures only via MappingHealth.ts (productionReadEnabled=false).

39. Legacy Mapping Score
Before: 80/100
After: 84/100
(Evidence+contract+fail-safe+tests for geo/customer/status/auth; not docs-only inflate)

40. Read-only Production Readiness Score
91/100
(Auth18/20 + Authz14/15 + Trip14/15 + Driver9/10 + Customer9/10 + Agent8/10
 + Geo9/10 + FinRead5/5 + Sec/PII5/5)

41. Critical SAFE READ blockers
0

42. Settlement blockers
Expected: still unresolved
(platform rate policy, discount treatment, agent attribution gaps, derived driver net,
chargeback accounting, VAT policy, …) — isSafeForSettlement NOT flipped to inflate score.

43. Accounting blockers
Expected: still unresolved
(stricter than settlement; chargeback not_represented, unresolved policies, …)
— isSafeForAccounting NOT flipped.

44. Tests passed
143

45. Tests failed
NONE

46. Typecheck
PASS

47. Build
PASS

48. Production Read
EXPECTED: DISABLED
ACTUAL: DISABLED (PRODUCTION_READ_ENABLED=false)

49. Production Write
EXPECTED: DISABLED
ACTUAL: DISABLED (all write flags false)

50. Recommendation:
GO for PHASE 4 DESIGN ONLY

51. Exact confirmation:
"Legacy source files were not modified."

52. Exact confirmation:
"Production Firebase was not accessed."

53. Exact confirmation:
"Production read remains disabled."

54. Exact confirmation:
"Production write remains disabled."
```

## Artifacts (Admin Next only)

### Docs
- docs/legacy-mapping/LEGACY_CLAIMS_TO_ADMIN_NEXT_MAPPING.md
- docs/legacy-mapping/AUTH_READINESS_MATRIX.md
- docs/legacy-mapping/TRIP_STATUS_SOURCE_PRIORITY.md
- docs/legacy-mapping/READ_AUTHORIZATION_CONTRACT.md
- docs/legacy-mapping/SENSITIVE_FIELD_REGISTRY.md
- docs/legacy-mapping/PHASE_4_PROPOSED_READ_SCOPE.md
- docs/legacy-mapping/PHASE_4_KILL_CONDITIONS.md
- docs/legacy-mapping/PHASE_4_SHADOW_MODE_DESIGN.md
- docs/legacy-mapping/legacy-city-aliases.json
- docs/legacy-mapping/GEOGRAPHY_CANONICALIZATION_PLAN.md (updated)
- docs/legacy-mapping/PHASE_3_7_READINESS.md
- docs/legacy-mapping/AUTH_PRODUCTION_BLOCKERS.md (updated)
- docs/PHASE_3_7_REPORT.md (this file)
- docs/legacy-baseline/legacy-*-phase37-*.txt

### Code
- src/domain/auth/ProductionIdentityVerifier.ts
- src/domain/auth/ProductionAuthDesign.ts (extended)
- src/config/authModeGuard.ts + env AUTH_MODE/MAX_PAGE_SIZE
- src/domain/geography/* , customer/*, pii/*, trip/TripStatusSourcePriority.ts
- src/domain/driver/DriverCanonicalStatuses.ts
- src/domain/canonical/TimestampMapper.ts, CurrencyMapper.ts
- src/domain/read/* (ReadQuery, ReadAuthorization, ApiError, SensitiveField, ResourceReadSafety, MappingHealth)
- src/app/admin-next-health/mapping/page.tsx
- src/test/unit/phase37-readiness.test.ts
- Permissions: customers:read, customers:read_pii, drivers:read_pii

## STOP
Phase 3.7 complete. No Phase 4 adapter / credentials / production connection.
