```
TOURI TAXI ADMIN NEXT
PHASE 4A-1 COUNTRIES-ONLY CONTROLLED CONNECTION REPORT

1. Overall status
NO-GO for live Production connection. Code gates, fingerprint extraction, operator checklist, and monitoring sinks beyond InMemory are complete and tested. Production Read/Write remain DISABLED. Zero Production Firebase Auth/Firestore calls in this phase. Dedicated Shadow Read credentials + human Project ID confirmation + IAM review were not available → live sequence NOT EXECUTED.

2. Legacy verification
Before: docs/legacy-baseline/legacy-status-phase4a1-before.txt + legacy-diff-phase4a1-before.txt
After: docs/legacy-baseline/legacy-status-phase4a1-after.txt + legacy-diff-phase4a1-after.txt
status_equal=true, diff_equal=true (SHA-256 identical). Admin Next did not modify ara-ban / Legacy sources. Pre-existing dirty Legacy tree left untouched.

3. Admin Next preflight
npm test PASS (208→221 after 4A-1 tests), npm run typecheck PASS, npm run build PASS (without Production credentials). Post-disable regression: test/typecheck/build PASS.

4. Production Project ID verification
Candidate from Legacy configs: tutorial-multi-language-70gx4j (Auth/Storage/Functions fingerprint documented in docs/phase4a/PRODUCTION_PROJECT_FINGERPRINT_REVIEW.md).
Human confirmation that this is real Production Touri Taxi: PENDING / NOT CONFIRMED.
Ambiguous Legacy target demo-touri-taxi (storage) documented — must not be used as EXPECTED_PROJECT_ID without explicit confirm.
EXPECTED_PROJECT_ID in local env: empty. Live fingerprint match against Firebase: SKIPPED / NOT EXECUTED.

5. Service identity used
NON-SECRET IDENTIFIER ONLY
NONE for Shadow Read. Detected local ADC: authorized_user (personal) with quota_project_id=tutorial-multi-language-70gx4j — NOT approved as dedicated Shadow identity.
gcloud auth list showed active firebase-adminsdk-vqcu4@… (Legacy deploy SA pattern) — explicitly forbidden for 4A-1 Shadow Read; not used.
GOOGLE_APPLICATION_CREDENTIALS / PRODUCTION_SERVICE_ACCOUNT_PATH: UNSET. No dedicated Admin Next Shadow SA provisioned in env.

6. Firestore IAM roles
SKIPPED / NOT EXECUTED — dedicated Shadow identity not provisioned. Required (documented): roles/datastore.viewer ONLY. Must NOT be datastore.user/admin, editor, owner, firebase.admin.

7. Authentication IAM roles
SKIPPED / NOT EXECUTED. Required if token verify needs Admin Auth getUser: roles/firebaseauth.viewer ONLY — not Auth editor/admin.

8. Confirmed absence of write/admin IAM
SKIPPED / NOT EXECUTED (no Shadow identity to review). Operator checklist section C requires this before live.

9. Credential storage method
NO SECRET VALUE
No Production Shadow credential injected. Preferred: Secret Manager / Workload Identity. Local key file not present via env path. ADC present but rejected for live use (wrong identity class). App continues with MissingProductionCredentialProvider when read disabled.

10. Monitoring sink
Code ready: StructuredLoggerProductionReadObservability + FileNdjsonProductionReadObservability (+ factory). Unit-tested. Default while disabled: memory.
Live activation: NOT EXECUTED (no live window). Startup FAIL if PRODUCTION_READ_ENABLED=true with sink=memory.

11. Production Authentication result
SKIPPED / NOT EXECUTED — no verified Production ID token / dedicated verifier credentials for live Auth validation.

12. Revocation/disabled-user validation
SKIPPED / NOT EXECUTED.

13. Project fingerprint result
Document extraction PASS (Legacy configs only). Runtime actualProjectId === EXPECTED_PROJECT_ID check: SKIPPED / NOT EXECUTED (no Firebase init). Human confirm PENDING → treats live fingerprint as blocked.

14. Production Read enablement window
NONE opened. Flags never set to enable live read during this phase. Window duration: 0.

15. LIVE_SHADOW_ALLOWED_RESOURCES
Implemented and enforced. Phase 4A-1 startup requires exactly "countries". Runtime: cities/trips/drivers/agents/customers → LIVE_RESOURCE_NOT_ENABLED. Current env value: empty (read disabled).

16. Countries collection queried
NOT EXECUTED (no live Firestore). Fake-only coverage in unit tests.

17. Number of documents read
N/A (live=0). No Production documents read.

18. Number mapped
N/A (live). Mapper mapCountryFromLegacyDoc wired + unit-tested.

19. Mapping warnings
N/A (live).

20. Unmapped countries
N/A (live).

21. Duplicate canonical IDs
N/A (live).

22. Query latency
N/A (live).

23. Mapping latency
N/A (live).

24. Pii exposure
EXPECTED: ZERO
ACTUAL: ZERO (no live documents; FULL_PII_SHADOW_ENABLED=false)

25. Production write calls
EXPECTED: ZERO
ACTUAL: ZERO (no Production client initialized; write flags false)

26. Mutation trap result
PASS (code/regression): shadowTrapForRequest → PRODUCTION_WRITE_DISABLED for mutations; covered by existing Phase 4A-0/4A-1 tests. Live HTTP probe against Production: NOT EXECUTED (no live server window).

27. Kill switch live result
PASS (Fake/local): PRODUCTION_READ_ENABLED=false → PRODUCTION_READ_DISABLED with zero Firestore query invocations (unit test). Live Production kill-switch window: NOT EXECUTED.

28. Request after kill-switch result
Fake/local: denied without new query. Live: NOT EXECUTED.

29. Monitoring event verification
Unit: production_read_request + production_read_denied / kill_switch events on structured + file sinks, scrubbed. Live Production events: NOT EXECUTED.

30. Unexpected collections accessed
EXPECTED: NONE
ACTUAL: NONE (no live queries)

31. Index changes
EXPECTED: NONE
ACTUAL: NONE

32. Security Rules changes
EXPECTED: NONE
ACTUAL: NONE

33. Cloud Functions changes
EXPECTED: NONE
ACTUAL: NONE (Legacy/functions not modified by this phase)

34. Legacy changes
EXPECTED: NONE
ACTUAL: NONE (status_equal + diff_equal)

35. Tests passed
221 (28 files)

36. Tests failed
0

37. Typecheck
PASSED

38. Build
PASSED (without Production credentials)

39. Final Production Read state
EXPECTED: DISABLED
ACTUAL: DISABLED (PRODUCTION_READ_ENABLED=false, PRODUCTION_READ_MODE=disabled)

40. Final Production Write state
EXPECTED: DISABLED
ACTUAL: DISABLED (all write flags false)

41. Credential cleanup/rotation status
N/A — no Shadow credential was loaded or left enabled. No key file created by this phase. Operator should still avoid using Legacy firebase-adminsdk for any future Shadow window.

42. Critical findings
- NO dedicated Admin Next Shadow Read identity with datastore.viewer-only IAM.
- Personal ADC / Legacy firebase-adminsdk identity present locally but must NOT be used for 4A-1.
- EXPECTED_PROJECT_ID human confirmation still PENDING (tutorial-named project id + demo-touri-taxi ambiguity).
- Live Auth + countries Firestore sequence therefore correctly blocked.
- Code gates for countries-only + FAIL STARTUP on write flags / memory-only monitoring / missing project id are in place.
- No BEGIN PRIVATE KEY material found in repo (only redaction/test pattern strings).

43. Recommendation:
NO-GO for PHASE 4A-2 CITIES SHADOW READ

44. Exact confirmation:
"No Production write occurred."

45. Exact confirmation:
"No live Production query ran; countries-only allowlist is enforced in code for any future window."

46. Exact confirmation:
"Legacy source files were not modified."

47. Exact confirmation:
"Production read was never left enabled; remains DISABLED (no live enablement window opened)."

48. Exact confirmation:
"Production write remains disabled."
```

---

## Artifacts delivered (Admin Next only)

| Artifact | Path |
|---|---|
| Fingerprint review | `docs/phase4a/PRODUCTION_PROJECT_FINGERPRINT_REVIEW.md` |
| Operator checklist | `docs/phase4a/PHASE_4A_1_OPERATOR_CHECKLIST.md` |
| This report | `docs/PHASE_4A_1_REPORT.md` |
| Legacy baselines | `docs/legacy-baseline/legacy-*-phase4a1-*.txt` |
| Live resource gate | `src/infrastructure/production/contracts/LiveShadowResourceGate.ts` |
| Startup multi-gate | `src/infrastructure/production/ops/LiveShadowStartupGuard.ts` |
| Observability sinks | `src/infrastructure/production/ObservabilityEvents.ts` |
| Country mapper | `mapCountryFromLegacyDoc` in `LegacyProductionMappers.ts` |
| Tests | `src/test/unit/phase4a1-countries-gate.test.ts` (+13) |

## Preconditions still required for a future live 4A-1 retry

1. Human confirm Production `EXPECTED_PROJECT_ID`
2. Provision dedicated Shadow SA / WI with `datastore.viewer` (+ optional `firebaseauth.viewer`) only; IAM review log
3. Inject credential outside repo (SM / WI / restricted path env)
4. Activate `PRODUCTION_READ_OBSERVABILITY_SINK=structured_logger|file_ndjson`
5. Pilot read-only auditor token (out-of-band)
6. Complete operator checklist all PASS
7. Only then open a short window: Auth → fingerprint → `listCountries` ≤20 → kill switch → disable

**Do not start 4A-2 cities until a live 4A-1 countries window meets the GO gate.**
