# TOURI TAXI ADMIN NEXT
## PHASE 3 LEGACY DISCOVERY & MAPPING REPORT

```
TOURI TAXI ADMIN NEXT
PHASE 3 LEGACY DISCOVERY & MAPPING REPORT

1. Overall status
COMPLETE — Discovery & mapping only in /Users/ventura/touri-admin-next.
No Legacy modifications by Phase 3. No Production Firebase access.
Production Read/Write remain disabled. Phase 4 adapters NOT designed/implemented.

2. Admin Next preflight
pwd: /Users/ventura/touri-admin-next
git: main (local dirty from prior phases — expected)
npm test: PASS (preflight 61; post-change see §48)
npm run typecheck: PASS
npm run build: PASS
Safety flags ALL false in .env.local / .env.development:
PRODUCTION_READ_ENABLED, PRODUCTION_WRITE_ENABLED, GLOBAL_PRODUCTION_WRITE_ENABLED,
FINANCE_WRITE_ENABLED, DRIVER_WRITE_ENABLED, AGENT_WRITE_ENABLED.

3. Legacy project path(s)
Primary (verified): /Users/ventura/ara-ban
Subprojects: admin/Admi (Admin), admin/ara_oatan_app (Customer),
admin/mndob-main (Driver), admin/services/payment-api, admin/touri-website.
Firebase project id (source .firebaserc): tutorial-multi-language-70gx4j
Nested app git roots: none (only ara-ban .git; Flutter SDK vendor .git ignored).

4. Legacy baseline status
Saved under docs/legacy-baseline/:
- legacy-git-status-before.txt
- legacy-diff-stat-before.txt
Pre-existing dirty tree (~18–24 paths: hosting_public build artifacts, geo alias work,
pubspec bumps). Left untouched — not cleaned.

5. Legacy files changed by Phase 3
EXPECTED: NONE
ACTUAL: NONE (post-check vs baseline; see §52)

6. Production resources changed
EXPECTED: NONE
ACTUAL: NONE

7. Production Read
EXPECTED: DISABLED
ACTUAL: PRODUCTION_READ_ENABLED=false

8. Production Write
EXPECTED: DISABLED
ACTUAL: all write flags false

9. Applications discovered
- Legacy Admin Flutter web (admin_arawatan) — Admi
- Customer Flutter (ara_oatan_app)
- Driver Flutter (mndob)
- payment-api (N-Genius HTTP CF codebase)
- touri-website (marketing)
- admin/scripts (ops)

10. Firestore collections discovered
Core: order, user, countries, cities, villages, mkan, type_car, wallets, transactions,
payment_sessions, financial_settlements(+lines/events), agent_country_assignment,
admin_audit_log, support, chat, plus finance satellite collections.
Full list: docs/legacy-mapping/FIRESTORE_COLLECTIONS.md

11. Realtime Database paths discovered
NOT FOUND — no FirebaseDatabase / RTDB usage in Admin/Customer/Driver app sources
(excluding node_modules/Pods/build).

12. Storage paths discovered
users/{userId}/**, landmarks/**, countries/**, regions/**, cities/**, type_car/**,
representatives/**, places/**, catch-all (Admi/firebase/storage.rules).
Bucket name in firebase.json: tutorial-multi-language-70gx4j.firebasestorage.app

13. Cloud Functions discovered
Admin finance/settlement/agent/claims callables; Customer N-Genius/wallet/driver/push;
Driver FCM; payment-api HTTP; custom autoCancelOrders. See CLOUD_FUNCTIONS_INVENTORY.md

14. Trip data source
Firestore collection order (OrderRecord). Confidence: high.

15. Trip status mapping
Canonical status_code (pending_driver → … → completed / cancelled_* / expired)
+ dual-write halh_text / halh_order. Payment orthogonal via payment_status.
See TRIP_STATUS_MAPPING.md

16. Driver data source
Firestore user (ismndob / driver flags). No separate drivers collection.

17. Driver status mapping
Five orthogonal axes: registration, account (actev_mndob), online, availability, on-trip.
See DRIVER_STATUS_MAPPING.md. CRITICAL: do not collapse axes.

18. Customer mapping
user docs without driver/agent admin persona; linked as order.USER.

19. Agent mapping
user.Isagent + Rev_dloh_agent; commission Agent_total % of platform fee;
snapshots agent_* on newer orders.

20. One-agent-per-country legacy enforcement
BACKEND (server lock agent_country_assignment + callables). Not UI-only.
Historical multi-agent still possible for attribution windows.

21. Geography mapping
countries / cities / villages / mkan; aliases city_sa_* / region_sa_*;
Taif/Jeddah promotion scripts → city scoping mismatch risk documented only.

22. Financial fields discovered
order majors: total, total_mndob2, total_app, total_vat, total_mndob, ksm;
settlements financial_*; wallets; agent snapshot fields; chargeback marker (low).

23. Financial formulas discovered
CF verifiedBookingAmount: platform 15% of base; VAT country.vat if isvat;
driverNet = base − app − vat; customer total = base − discount.
V2 accounting derive paths when stored net missing.
Payment-api mirrors CF.

24. Conflicting financial formulas
FC-01 hardcode 15% vs app_commission_percent; FC-02 net from base vs total;
FC-03 misleading V1 names; FC-04 paid vs completed; FC-05 agent attribution;
FC-06 wallet aliases; FC-07 chargeback; FC-09 multi-engine. See LEGACY_FINANCIAL_CONFLICTS.md

25. VAT implementation discovered
countries.isvat + countries.vat % of baseFare in CF quote → order.total_vat.
Confidence: high for write path.

26. Platform commission implementation
CF: percent(baseFare, 15) hardcoded → order.total_app.
Country/user app_commission_percent AMBIGUOUS / low confidence vs CF.

27. Agent commission implementation
Agent_total % of platform fee (share of company commission); snapshot on order create
for new trips; historical often country-scope only.

28. Driver net implementation
order.total_mndob = base − app − vat (CF). V2 may derive if missing.
V1 alias name repCommission — CRITICAL naming trap.

29. Cash flow implementation
pending_cash → accept via CF wallet gate → complete → cash_collected;
signed cash position driver holds cash, owes platform+VAT.

30. Online payment flow
N-Genius create/finalize/webhook; payment_status=paid; company holds funds;
driver entitlement owed by company.

31. Refund handling
refundNGeniusPayment + payment-api /api/payments/refund. Proven.
payment_status refunded supported in status codes.

32. Chargeback handling
NOT FOUND as gateway pipeline. UI projection reads chargeback bool /
payment_status=chargeback only. Confidence: low → Production Read blocker.

33. Wallet/balance implementation
wallets + transactions; acceptDriverOrder / payCompanyFromWallet /
adminAdjustDriverWallet. Field alias currentBalance vs walletBalance.

34. Settlement implementation
financial_settlements V2 callables (draft/lock/settle/void/payments/exposure).
Directions DRIVER_PAYS_COMPANY / COMPANY_PAYS_DRIVER.

35. Ledger implementation
Operational settlement_ledger + financial_* collections — NOT a classic CoA GL.
Admin Next Phase 2 synthetic ledger is separate and productionApproved=false.

36. Auth implementation
Firebase Auth + user profile + custom claims (panel_claims / syncUserClaimsOnWrite).
Admin Next: mock/dev header auth only.

37. Legacy RBAC
isAdminRule 1–5 + Isagent/partner/transport flags → claims.
AdminRoleService route matrix. See LEGACY_AUTH_RBAC.md

38. Security rules findings
Three firestore.rules copies; country scoping; agent snapshot immutability;
storage catch-all risk; potential drift. Read-only analysis only.

39. Index findings
Heavy composite indexes on order, user, financial_settlements, geo, transactions
(Admi/firebase/firestore.indexes.json).

40. Notification findings
FCM tokens, ff_user_push_notifications triggers, admin_panel_notifications,
driver_registration_notifications, WhatsApp secureIntegrations.

41. Critical legacy findings
C-01 Misleading V1 financial names
C-02 Hardcoded 15% platform fee vs country fields
C-03 Driver status axis collapse hazard
C-04 Historical agent attribution gaps
C-05 Dual status_code / halh_text SoT

42. High-risk legacy findings
Multi-engine finance disagreement; rules drift; client non-cash status writes;
wallet aliases; geo alias city scoping; chargeback absence; x-user-id auth.

43. Unknown/low-confidence mappings
Chargeback lifecycle; app_commission_percent authority; RTDB (absent);
some aux collections (orders plural, demodelet); full settlement SM edge cases
without live docs; partner/transport Admin Next coverage.

44. Production Read blockers
- Financial FC-01, FC-02, FC-05, FC-07 unresolved policies
- Auth: no Firebase token verify; x-user-id forbidden in prod (enforced)
- Wallet field alias reconciliation
- Historical incomplete financial / agent snapshots → incomplete not zero
- Dependency gate re-audit before enablement
- PRODUCTION_READ_ENABLED must stay false

45. x-user-id production blocker status
DOCUMENTED + ENFORCED: staging/production reject x-user-id and mock bearer
(apiAuth.ts + api-auth-production.test.ts). Dev mock remains.

46. Dependency production blockers
vitest critical (dev-only) ACCEPTED formally; postcss high via Next 15 ACCEPTED
until coordinated upgrade. No npm audit fix --force. See DEPENDENCY_PRODUCTION_GATE.md

47. Mapping readiness score /100
43 / 100 (Production Read Readiness — honest)

Weights (approx): mapping completeness 15→12.5; financial confidence 25→8;
auth readiness 15→3; conflict policies 15→4.5; rules 10→6; functions 10→7.5;
agent/geo 10→5. Finance + auth blockers dominate.

48. Tests passed
66/66 (includes 5 api-auth-production safety tests). Mapping compiler OK (30 fields).

49. Tests failed
NONE

50. Typecheck
PASS

51. Build
PASS

52. Legacy post-check
Re-ran git status --short and git diff --stat on /Users/ventura/ara-ban;
compared to docs/legacy-baseline/*-before.txt — no new Phase-3-caused diffs.

53. Exact confirmation:
"Legacy source files were not modified by Phase 3."

54. Exact confirmation:
"Production Firebase was not accessed by Admin Next."

55. Exact confirmation:
"Production read remains disabled."

56. Exact confirmation:
"Production write remains disabled."

57. Recommendation:
NO-GO for designing Phase 4 controlled Production Read
until Production Read blockers (§44) have explicit read policies and real auth design.
Discovery artifacts are ready as inputs; adapters must not start yet.
```

## Artifacts

All under `docs/legacy-mapping/` + `docs/legacy-baseline/` + this report.

## Admin Next code changes (safety only)

- `src/infrastructure/http/apiAuth.ts` — reject header/mock auth outside development
- `src/test/unit/api-auth-production.test.ts`
- `src/types/legacy-mapping.ts` — types only
- `scripts/compile-legacy-mapping.js` — local JSON validator (no Firestore)
- Docs updates: README, ARCHITECTURE, SECURITY_DEPENDENCIES, DEPENDENCY_PRODUCTION_GATE
