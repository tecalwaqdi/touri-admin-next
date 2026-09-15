# Admin Next Product Completion Audit

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PRODUCT COMPLETION INVENTORY (audit + roadmap only)  
**Date:** 2026-09-15  
**Constraints honored:** no implementation, no deploy, no Production data mutation, no write enablement, no WIF/Auth/FR7 changes.

**Production context (given + code-verified):**
- WIF-native Production list reads armed via `PRODUCTION_READ_ENABLED` + `PRODUCTION_READ_MODE=shadow` (`src/infrastructure/http/shadowApi.ts`).
- Finance / Settlements / Reports served by FR7 `FinanceReportingReadService`.
- Drivers / Customers / Geography country lists live via `ProductionOperationalApiReads`.
- Synthetic fallback forbidden in Production (`assertNoProductionSyntheticFallback`).
- Writes remain disabled (`PRODUCTION_WRITE_*` gates + shadow mutation traps).

---

## 1. Executive summary

Admin Next is **read-capable for core list surfaces and FR7 finance**, but **not product-complete for commercial operators**.

Critical blockers:
1. **Detail routes are broken in Production** — `GET /api/{drivers|customers|agents|trips}/[id]` return `PRODUCTION_READ_DISABLED` when Production read is active (`productionReadDisabledResponse`), while list UIs still deep-link to them → operators see “not found”.
2. **Users / Audit fail closed** — no Production RO source wired (`PRODUCTION_USER_SOURCE_NOT_CONFIGURED`, `PRODUCTION_AUDIT_SOURCE_NOT_CONFIGURED`).
3. **Dashboard operational KPIs are bounded samples (≤50)** but UI labels them as totals (`totalTrips`, etc.); only one card hints “Bounded sample ≤50”.
4. **Localization is shallow** — `src/i18n/messages.ts` covers nav/chrome only; finance/status/table headers remain English/internal keys.
5. **Lists are minimal** — many canonical fields exist in read models but are not presented; cities/landmarks have repos but no product UI.
6. **Production data quality** — pilot/test markers, CP5 geography IDs, and possible Super-Admin/agent contamination require classification (not deletion).

**Verdict:** PRODUCT COMPLETION AUDIT = **FAIL** (inventory complete; product not ready for cutover).

**Recommended next phase:** **PC-1 Critical correctness** (KPI honesty + detail-route Production reads wiring plan execution).

---

## 2. Current Production readiness score

| Dimension | Weight | Score (0–100) | Notes |
|---|---:|---:|---|
| Auth / WIF / fail-closed reads | 15 | 85 | Verified token + WIF-native transport live |
| List surfaces (trips/drivers/customers/agents/geo) | 20 | 70 | Live but minimal columns; cursor/pagination UX weak |
| Detail surfaces | 15 | 10 | API stubs block Production; UI still synthetic-shaped |
| Finance / Settlements / Reports (FR7) | 20 | 75 | Live RO; terminology/UX incomplete; writes off |
| Users / Roles / Audit | 10 | 5 | Fail-closed; no Production source |
| Localization / RTL | 10 | 35 | Dir works; content mostly EN/internal |
| Data quality / pilot hygiene | 5 | 40 | Markers exist; KPI exclusion not applied |
| Actions / controlled writes | 5 | 15 | UI shells exist; Production writes disabled (correct for now) |

**CURRENT READINESS SCORE: 45 / 100**

Interpretation: safe **Production read pilot / shadow ops**, not commercial Admin cutover.

---

## 3. Route/page matrix

Classification legend: `COMPLETE` | `PARTIAL` | `MISSING` | `BROKEN` | `WRONG DATA SOURCE` | `WRONG LABEL` | `MISSING FIELD` | `MISSING FILTER` | `MISSING ACTION` | `MISSING DETAIL ROUTE` | `UX ISSUE` | `LOCALIZATION ISSUE` | `DATA QUALITY ISSUE` | `SECURITY/RBAC ISSUE`

For each surface: fields **1–18**.

### 3.1 Dashboard — `/dashboard`

| # | Field | Finding |
|---|---|---|
| 1 | Route | `/dashboard` → `src/app/dashboard/page.tsx` → `DashboardPage` |
| 2 | UI | `src/features/dashboard/DashboardPage.tsx` |
| 3 | API | `GET /api/dashboard` (+ optional `GET /api/finance/dashboard` for FR7) |
| 4 | Prod source | `getProductionDashboardMetrics` — WIF trips/drivers/customers lists, `limit = WIF_NATIVE_MAX_READ_LIMIT (50)`; FR7 for money |
| 5 | Fields shown | totalTrips, completedTrips, cancelledTrips, activeDrivers, customers, pendingDrivers; FR7 gross/commission/cash/online |
| 6 | Not shown (available) | `boundedSampleLimit`, truncated flags, pilot classification of sample, date range filters in API unused by UI |
| 7 | Filters | countryId, currencyCode (hardcoded ISO options) |
| 8 | Missing filters | from/to date (API supports), agent, status, pilot-exclude |
| 9 | Actions | drilldown links to lists |
| 10 | Expected RBAC | open to authenticated admin; finance section gated `finance:read` |
| 11 | Detail route | N/A (drilldowns to lists) |
| 12 | Localization | Partial — metric labels via `t()`; “Currency”, “All”, FR7 English labels hard-coded |
| 13 | RTL | Shell `dir` from locale |
| 14 | States | Skeleton / Error / SourceLabel present |
| 15 | Responsive | Grid `sm/xl` OK; filters wrap |
| 16 | Source label | Correct when API returns; Production bounded sample |
| 17 | Severity | **P0** — misleading totals |
| 18 | Fix phase | **PC-1** |
| **Class** | | **PARTIAL** + **WRONG LABEL** + **UX ISSUE** + **LOCALIZATION ISSUE** |

### 3.2 Trips list — `/trips`

| # | Field | Finding |
|---|---|---|
| 1 | `/trips` | `TripsPage` |
| 2 | UI | `src/features/trips/TripsPage.tsx` |
| 3 | API | `GET /api/trips` → `listProductionTripsApi` |
| 4 | Prod source | Legacy `order` via WIF trip repo; bounded latest page |
| 5 | Shown | id, customerName, driverName, status, countryId, details link |
| 6 | Not shown | paymentMethod, currency, landmarks, cancellation, financialSafeRead, createdAt, agentId, incompleteReasons |
| 7 | Filters | status, search (client) |
| 8 | Missing | country, date range, payment method, agent, cursor-based next |
| 9 | Actions | open detail |
| 10 | RBAC | `trips:read` |
| 11 | Detail | **BROKEN in Production** (see §4) |
| 12 | i18n | Headers partly `t()`; status values raw EN enums |
| 13 | RTL | Shell OK; `text-left` on thead |
| 14 | States | Loading/Error/Empty |
| 15 | Mobile | Wide table overflow |
| 16 | Source label | **Missing** on trips list page |
| 17 | Severity | P1 |
| 18 | Phase | PC-2 (detail), PC-3 (fields), PC-7 (i18n) |
| **Class** | | **PARTIAL** + **MISSING FIELD** + **MISSING FILTER** + **MISSING DETAIL ROUTE** + **LOCALIZATION ISSUE** |

### 3.3 Trip detail — `/trips/[id]`

| # | Field | Finding |
|---|---|---|
| 1–3 | Route/UI/API | `TripDetailPage` → `GET /api/trips/[id]` |
| 4 | Prod source | **None when Production read active** — returns 503 `PRODUCTION_READ_DISABLED` |
| 5 | Shown (dev only) | overview/parties/status/payment/financial tabs; synthetic badge hard-coded |
| 6 | Canonical available | Full `CanonicalTripReadModel` via `ProductionTripReadRepository.getById` (exists, unwired) |
| 7–8 | Filters | N/A |
| 9–10 | Actions | none; no trip mutations expected now |
| 11 | Detail status | **BROKEN** |
| 12–16 | i18n/RTL/states/source | Hard-coded “Synthetic Data”; wrong source badge in Production path if ever reached |
| 17 | Severity | **P0** |
| 18 | Phase | **PC-2** |
| **Class** | | **BROKEN** + **WRONG DATA SOURCE** (badge) + **MISSING DETAIL ROUTE** (Prod wiring) |

### 3.4 Drivers list — `/drivers`

| # | Field | Finding |
|---|---|---|
| 1–3 | `/drivers` → `DriversPage` → `GET /api/drivers` |
| 4 | Prod | `listProductionDriversApi` / `user` + driver discriminator |
| 5 | Shown | name, registrationStatus, approvalStatus, availabilityStatus, details |
| 6 | Not shown | phone/email hints, country/city, vehicle make/model/plate, compliance slots, rating, tripCount, agentId, mappingStatus, incompleteReasons |
| 7 | Filters | search |
| 8 | Missing | country, registration, availability, agent, pilot-exclude |
| 9 | Actions | details only |
| 10 | RBAC | `drivers:read`; write actions on detail (`drivers:approve`) disabled in Prod |
| 11 | Detail | **BROKEN** |
| 12 | i18n | “Name” hard-coded; statuses raw |
| 13–15 | RTL/states/mobile | Shell OK; table overflow |
| 16 | Source label | Missing on list |
| 17 | P1 | |
| 18 | PC-2 / PC-3 / PC-7 |
| **Class** | | **PARTIAL** + **MISSING FIELD** + **MISSING FILTER** + **MISSING DETAIL ROUTE** + **LOCALIZATION ISSUE** |

### 3.5 Driver detail — `/drivers/[id]`

| # | Field | Finding |
|---|---|---|
| 1–3 | `DriverDetailPage` → `GET /api/drivers/[id]` (+ reports earnings) |
| 4 | Prod | **Blocked** by `productionReadDisabledResponse` |
| 5 | Dev UI | name, statuses, country/city, agent, vehiclePlate, placeholder docs, write actions, synthetic earnings |
| 6 | Canonical not shown | vehicle.type/model/name, compliance slots/expiry, authUid knowledge, accountEnabled, mappingStatus, financial DOCUMENT_ONLY flags, rejection reasons |
| 9–10 | Actions UI | Approve/Reject/Needs changes/Suspend — Production returns write-disabled (correct now) |
| 11 | **BROKEN** | |
| 16 | Source | Hard-coded synthetic badge — **WRONG LABEL** if Prod were wired |
| 17 | P0 | PC-2 + PC-3 docs/vehicle |
| **Class** | | **BROKEN** + **MISSING FIELD** + **MISSING ACTION** (deferred to PC-9) + **LOCALIZATION ISSUE** |

### 3.6 Driver documents / vehicle (capability inventory)

| Surface | Status | Evidence |
|---|---|---|
| Documents | **MISSING** as first-class UI | Canonical `compliance.slots[]` in `CanonicalDriverReadModel`; detail shows placeholder string only |
| Vehicle | **PARTIAL** (plate only) | Canonical `vehicle.{typeCarId,name,model,plateMasked}`; list omits; detail plate only |
| Class | **MISSING** / **MISSING FIELD** | Fix **PC-3** (read-only) |

### 3.7 Customers list — `/customers`

| # | Field | Finding |
|---|---|---|
| 1–3 | `CustomersPage` → `GET /api/customers` |
| 4 | Prod | `listProductionCustomersApi` / `listSummary` |
| 5 | Shown | name, countryId, status, tripCount, details |
| 6 | Gap | `mapCanonicalCustomerToListItem` does **not** map tripCount/bookings → UI may show undefined/0; phone/email hints mapped but not displayed; deletion state absent |
| 7–8 | Filters | page only; missing country/status/search |
| 11 | Detail **BROKEN** | |
| 16 | Source label missing | |
| **Class** | | **PARTIAL** + **MISSING FIELD** + **MISSING FILTER** + **MISSING DETAIL ROUTE** + **DATA QUALITY ISSUE** (tripCount) |

### 3.8 Customer detail — `/customers/[id]`

| # | Field | Finding |
|---|---|---|
| 4 | Prod | **Blocked** (`productionReadDisabledResponse`) |
| 5 | Dev | name, country/city, status, operational state, trip counts, write actions |
| 6 | Canonical inventory unused | phoneHint/emailHint, accountState, tripLockHint, geographyRepresentation, mappingStatus, financial bookingsCount, deletion (not in canonical — see §8) |
| Repo capability | `getSummaryById` exists on `ProductionCustomerReadRepository` — unwired to API |
| **Class** | | **BROKEN** |

### 3.9 Agents list — `/agents`

| # | Field | Finding |
|---|---|---|
| 4 | Prod | `listProductionAgentsApi` |
| 5 | Shown | name, countryId, status, country invariant, driversCount, tripsCount |
| 6 | Gap | driversCount/tripsCount hard-mapped to **0** in `mapCanonicalAgentToListItem`; finance KPIs not on list |
| 7 | country filter (ISO hardcode) | may not match canonical ids (`saudi_arabia` vs `SA`) → **MISSING FILTER** / **DATA QUALITY ISSUE** |
| 11 | Detail **BROKEN** | |
| **Class** | | **PARTIAL** + **MISSING FIELD** + **WRONG LABEL** (counts) + **MISSING DETAIL ROUTE** |

### 3.10 Agent detail — `/agents/[id]`

| # | Field | Finding |
|---|---|---|
| 4 | Prod agent GET | **Blocked** |
|  | FR7 subcalls | `/api/finance/agents/[id]`, settlements — may work if agent loaded; currently never reached |
| 5 | Dev UI | identity, FR7 cash/outstanding, settlements, history, write actions |
| 6 | Missing | partner/landmark metrics, performance KPIs beyond FR7, contamination/role warnings |
| **Class** | | **BROKEN** |

### 3.11 Finance — `/finance`

| # | Field | Finding |
|---|---|---|
| 3 | APIs | `/api/finance/dashboard`, `/reconciliation`, `/corrections` |
| 4 | Prod | FR7 WIF RO collections (`FINANCE_REPORTING_RO_COLLECTIONS`) |
| 5 | Shown | All `COMPANY_KEYS` as **raw property names**; currency groups; corrections table |
| 6 | Presentation | Internal keys as labels → **WRONG LABEL** / **LOCALIZATION ISSUE** |
| 9 | Actions | none (read-only correct) |
| 16 | SourceLabel + FR7 badge | Mostly correct |
| **Class** | | **PARTIAL** + **WRONG LABEL** + **LOCALIZATION ISSUE** + **UX ISSUE** |

### 3.12 Settlements list — `/settlements`

| # | Field | Finding |
|---|---|---|
| 3 | `GET /api/finance/settlements` | |
| 4 | FR7 Production | |
| 5 | ID, Party, country, status, Amount, Outstanding | |
| 9 | “New” link if `settlements:create` — write path still gated | **MISSING ACTION** (deferred PC-9) |
| 12 | Party/Outstanding/New/status enums EN | |
| **Class** | | **PARTIAL** + **LOCALIZATION ISSUE** + **MISSING ACTION** (writes later) |

### 3.13 Settlement detail — `/settlements/[id]`

| # | Field | Finding |
|---|---|---|
| 3 | `GET /api/finance/settlements/[id]` | FR7 detail — **not** blocked by operational `productionReadDisabledResponse` |
| 4 | Prod FR7 | Live path expected |
| 5 | status, party, amounts, etc. | English labels / “Unknown” |
| 11 | Detail | **PARTIAL** (works if FR7 doc exists; pilot IDs may appear) |
| **Class** | | **PARTIAL** + **LOCALIZATION ISSUE** + **DATA QUALITY ISSUE** (pilot docs) |

### 3.14 Settlements new — `/settlements/new`

| Class | **PARTIAL** shell / **MISSING ACTION** in Production (writes disabled) | Phase **PC-9** |

### 3.15 Reports — `/reports`

| # | Field | Finding |
|---|---|---|
| 3 | `GET /api/finance/export` | |
| 4 | FR7 | |
| 5 | report types as raw keys; CSV export | |
| 9 | Export CSV — permission `reports:export` | Present |
| **Class** | | **PARTIAL** + **LOCALIZATION ISSUE** + **UX ISSUE** |

### 3.16 Geography — `/geography` (countries)

| # | Field | Finding |
|---|---|---|
| 3 | `GET /api/geography/countries` → `listProductionCountriesApi` |
| 4 | WIF countries + agents | countries page `limit: 20` — may truncate |
| 5 | countryId (raw), active agent, currencyHint, invariant, inactive count |
| 6 | Canonical `name` **not mapped into CountryListItem** → IDs like `saudi_arabia` / `cp5_country_*` dominate UI |
| 11 | Agent detail links → broken agent detail | |
| **Class** | | **PARTIAL** + **WRONG LABEL** + **DATA QUALITY ISSUE** + **MISSING FIELD** (display name) |

### 3.17 Countries (as product concept)

Covered by Geography page. **PARTIAL**. Canonicalization table in `CountryCanonicalization.ts`; CP5 classified test/noncanonical in domain but still listable if returned by repo.

### 3.18 Cities

| # | Field | Finding |
|---|---|---|
| Route | **MISSING** page | No `/geography/cities` UI |
| API | `GET /api/geography/cities` | Returns stub / `productionReadDisabledResponse` when Production armed |
| Repo | `listCities` on Production geography repo exists | Unwired to product UI |
| **Class** | | **MISSING** |

### 3.19 Landmarks

| # | Field | Finding |
|---|---|---|
| Route/UI | **MISSING** | |
| Repo | `listLandmarks` (`mkan`) exists | |
| API | No dedicated landmarks product route under `src/app/api/geography/` | |
| **Class** | | **MISSING** |

### 3.20 Users — `/users`

| # | Field | Finding |
|---|---|---|
| 3 | `GET /api/users` | |
| 4 | Prod | Explicit empty + 503 `PRODUCTION_USER_SOURCE_NOT_CONFIGURED` |
| 5 | Dev only | masked email, role, scope, status, permissionCount |
| 9–10 | Manage actions | None; RBAC `users:manage` gates page only |
| **Class** | | **BROKEN** (Prod unavailable) / **MISSING** Production source |

### 3.21 Roles / Permissions

| Surface | Status |
|---|---|
| Matrix | Implemented in code: `src/permissions/rbac.ts` `ROLE_PERMISSION_MATRIX` |
| Admin UI to view/edit roles | **MISSING** |
| Prod persistence of admin roles directory | **MISSING** (claims-mapped actor only via `/api/auth/me`) |
| **Class** | **MISSING** (UI) + **SECURITY/RBAC ISSUE** (directory not inspectable) |

### 3.22 Audit — `/audit`

| # | Field | Finding |
|---|---|---|
| 3 | `GET /api/audit` | |
| 4 | Prod | 503 `PRODUCTION_AUDIT_SOURCE_NOT_CONFIGURED` |
| 5 | Dev synthetic events + detail pane | |
| Filters | actor/action/resource/environment — EN placeholders | |
| **Class** | | **BROKEN** / **MISSING** Production source |

### 3.23 Header

| # | Field | Finding |
|---|---|---|
| UI | `Header.tsx` | env badge, notifications stub “—”, locale switch, user menu, logout |
| **Class** | | **PARTIAL** + **MISSING** notifications + **LOCALIZATION ISSUE** (role raw) |

### 3.24 Sidebar / navigation

| # | Field | Finding |
|---|---|---|
| Config | `NAV_ITEMS` in `navigation.ts` | Dashboard→Audit; Settings/Support hidden (not in nav) |
| Shadow mode | Hides finance/settlements/reports/users (`ShadowNav.ts`) — may surprise if shadow UI mode differs from live nav |
| **Class** | | **PARTIAL** + **UX ISSUE** (shadow vs full nav) |

### 3.25 Login — `/login`

| # | Field | Finding |
|---|---|---|
| UI | `LoginPage.tsx` | Firebase bearer in Prod; mock in dev |
| i18n | Form labels OK; helper text English-only | |
| **Class** | | **PARTIAL** + **LOCALIZATION ISSUE** (near-complete for auth) |

### 3.26 Error / Empty / Loading / 404

| Surface | Class | Notes |
|---|---|---|
| QueryStates | PARTIAL | Shared Loading/Empty/Error; many EN messages |
| `error.tsx` | PARTIAL | “Something went wrong” / “Retry” hard-coded EN |
| `not-found.tsx` | PARTIAL | “Page not found” EN; no i18n/RTL shell |
| **Class** | | **PARTIAL** + **LOCALIZATION ISSUE** + **UX ISSUE** |

### 3.27 Language / RTL

| # | Field | Finding |
|---|---|---|
| Mechanism | `I18nProvider` sets `dir` rtl/ltr; `AdminShell` applies `dir` | |
| Message catalog | ~33 keys only | |
| Gaps | StatusBadge raw values; finance keys; table headers; filters “All” | |
| **Class** | | **PARTIAL** + **LOCALIZATION ISSUE** |

### 3.28 Responsive behavior

| Class | **PARTIAL** + **UX ISSUE** | Sidebar fixed width; tables `min-w-full` without mobile card alternative; works but operational density poor on phone |

### 3.29 Source-label badges

| Class | **PARTIAL** | `SourceLabelBadge` truthful (`production` / `production_pilot` / `synthetic` / `unavailable`). Used on Dashboard/Finance/Settlements/Reports/Users/Audit. **Missing** on Trips/Drivers/Customers/Agents/Geography lists. Detail pages hard-code synthetic — **WRONG LABEL**. |

### 3.30 Support / Settings

| Route | Class |
|---|---|
| `/support`, `/settings` | **MISSING** product (ComingSoonPage); hidden from nav — acceptable defer |

### 3.31 Health mapping — `/admin-next-health/mapping`

| Class | **PARTIAL** (shadow/debug) | Shadow nav only; not commercial surface |

---

## 4. Broken detail-route matrix

| Entity | UI route | API | Production behavior | Repo capability exists? | Root cause | Severity |
|---|---|---|---|---|---|---|
| Trip | `/trips/[id]` | `GET /api/trips/[id]` | 503 `PRODUCTION_READ_DISABLED` | `ProductionTripReadRepository.getById` **YES** | API short-circuits when `productionReadPathActive()` | P0 |
| Driver | `/drivers/[id]` | `GET /api/drivers/[id]` | same | `getById` **YES** | same | P0 |
| Customer | `/customers/[id]` | `GET /api/customers/[id]` | same | `getSummaryById` **YES** | same | P0 |
| Agent | `/agents/[id]` | `GET /api/agents/[id]` | same | `getById` **YES** | same | P0 |
| Settlement | `/settlements/[id]` | `GET /api/finance/settlements/[id]` | FR7 path (separate) | FR7 adapter | Not in this breakage class | P2 (UX/i18n) |

**Operator symptom:** list → Details → “Driver/Customer/Agent/Trip not found” (UI maps any non-OK to not-found).

**Plan (PC-2 only — not implementing now):**
1. Wire each detail GET through `resolveApiActor` + Production runtime `getById` / `getSummaryById`.
2. Map canonical → detail DTO (masked PII; scope via existing `isWithinScope`).
3. Replace hard-coded synthetic badges with `resolveAdminDataSourceLabel`.
4. Keep write actions fail-closed until PC-9.

---

## 5. Missing fields/actions matrix

### 5.1 Fields (canonical/domain present → UI absent)

| Domain | Missing from UI (evidence) |
|---|---|
| Driver | vehicle name/model/type; compliance slots/expiry; phone/email (PII-gated); country/city on list; mappingStatus; incompleteReasons; rejection/needs_changes reason; suspension reason; trip stats; wallet (non-authoritative) |
| Customer | phoneHint/emailHint on list; account deletion state (not in canonical — gap); cancellation stats beyond list tripCount; tripLockHint; geographyRepresentation; bookingsCount |
| Agent | real drivers/trips counts; finance summary on list; role contamination warnings; assignment lock id; commission rates (DOCUMENT_ONLY — show as non-authoritative) |
| Trip | payment, currency, landmarks, timestamps, cancellation, financialSafeRead |
| Geography | country **display name**; cities; landmarks; currencies beyond hint |
| Finance | business labels (see §6); date period controls |

### 5.2 Actions

| Action | RBAC | UI | Production | Phase |
|---|---|---|---|---|
| Driver approve/reject/needs_changes/suspend | `drivers:approve` | Detail write actions | Disabled (correct) | PC-9 |
| Agent activate/deactivate/suspend | `agents:manage` | Detail | Disabled | PC-9 |
| Customer manage | `customers:manage` | Detail | Disabled | PC-9 |
| Settlement create/prepare/approve/execute | settlements:* | List “New” + future | Disabled | PC-9 |
| Report export CSV | `reports:export` | Present | RO export OK | PC-5 polish |
| Users manage | `users:manage` | Page only | Source missing | PC-4 |
| Audit read | `audit:read` | Page only | Source missing | PC-4 |

**MISSING ACTION COUNT (commercial expected, not usable today): 12**  
(driver×4, agent×3, customer manage, settlement create/prepare/approve/execute ≈4 counted as settlement workflow, users manage) — writes intentionally off; still product-incomplete.

---

## 6. Localization terminology map

### 6.1 Finance internal key → EN business → AR business

Presentation only — **do not rename domain fields**.

| Internal key | English (operator) | Arabic (operator) |
|---|---|---|
| grossBookingValue | Gross booking value | إجمالي قيمة الحجوزات |
| eligibleRevenue | Eligible revenue | الإيراد المؤهل |
| platformCommission | Platform commission | عمولة المنصة |
| companyAllocation | Company allocation | حصة الشركة |
| vatTax | VAT / tax | ضريبة القيمة المضافة |
| gatewayFees | Payment gateway fees | رسوم بوابة الدفع |
| refunds | Refunds | المبالغ المستردة |
| chargebacks | Chargebacks | عمليات الاسترداد القسري |
| adjustmentsMonetary | Monetary adjustments | تسويات مالية |
| reversals | Reversals | عمليات عكس القيود |
| collectedCash | Cash collected | التحصيل النقدي |
| electronicCardReceipts | Card / online receipts | التحصيل الإلكتروني |
| receivables | Receivables | مستحقات لنا |
| payables | Payables | مستحقات علينا |
| settled | Settled | مُسوّى |
| outstanding | Outstanding | الرصيد المتبقي |
| disputedSuspense | Disputed / suspense | متنازع / معلّق |
| netRecognizedPosition | Net recognized position | المركز الصافي المعترف به |
| amountMinor | Amount (minor units) | المبلغ (وحدات صغرى) — prefer formatted money |
| availability | Data availability | توافر البيانات |
| incompleteReasons | Incomplete reasons | أسباب عدم الاكتمال |
| sourceCompleteness | Source completeness | اكتمال المصدر |
| partyType / partyIdToken | Party | الطرف |
| settlementStatus draft/locked/approved/… | Draft / Locked / Approved / … | مسودة / مقفل / معتمد / … |
| Company metrics | Company metrics | مؤشرات الشركة |
| By currency (no mix) | By currency | حسب العملة |
| Corrections visibility | Corrections | التصحيحات |
| Scope | Scope | النطاق |
| Recon | Reconciliation | المطابقة |
| Gross / Commission / Settled | (same) | إجمالي / عمولة / مُسوّى |
| Kind / Status / Amount / Monetary | Kind / Status / Amount / Monetary | النوع / الحالة / المبلغ / نقدي؟ |
| FR7 authoritative | Authoritative finance (FR7) | المالية المعتمدة (FR7) |

### 6.2 Operational status strings (StatusBadge raw)

| Raw | EN | AR |
|---|---|---|
| approved | Approved | معتمد |
| pending / pending_review | Pending review | قيد المراجعة |
| draft | Draft | مسودة |
| rejected | Rejected | مرفوض |
| needs_changes | Needs changes | يحتاج تعديلات |
| suspended | Suspended | موقوف |
| unknown / unavailable | Unknown / Unavailable | غير معروف / غير متاح |
| active / inactive | Active / Inactive | نشط / غير نشط |
| pass / fail_multiple_active / no_active_agent | Pass / Multiple active agents / No active agent | ناجح / أكثر من وكيل نشط / لا وكيل نشط |
| completed / cancelled_* | Completed / Cancelled | مكتملة / ملغاة |

### 6.3 Chrome / tables hard-coded EN (sample inventory)

Name, Party, Outstanding, New, Currency, All, Active agent, Invariant, Inactive agents, Vehicle, Documents, Report, Export CSV, Mapping Health, Sign in with your Firebase…, Something went wrong, Page not found, Retry, Actor, Action, Resource type, Environment, Time, Select an event, Operational state, Completed / cancelled, Synthetic earnings, Assignment history, Country invariant, Bounded sample ≤50 (EN-only hint), Gross booking, Platform commission, Unknown, Missing, Not represented, Incomplete, Policy blocked.

**LOCALIZATION ISSUE COUNT: 52** (distinct operator-visible EN/internal strings catalogued above + finance key set).

---

## 7. Dashboard KPI correctness audit (Special A)

### 7.1 What is exact vs bounded

| KPI | Source | Exact total? | Honest label today? |
|---|---|---|---|
| totalTrips | ≤50 WIF trip sample | **NO** — sample size | **NO** — labeled `t("totalTrips")` / “Total trips” |
| completedTrips | subset of sample | **NO** | **NO** (no hint) |
| cancelledTrips | subset of sample | **NO** | **NO** |
| activeDrivers | ≤50 drivers sample | **NO** | **NO** |
| pendingDrivers | ≤50 drivers sample | **NO** | **NO** |
| customers | ≤50 customers sample length | **NO** | **NO** |
| FR7 company money metrics | FinanceReportingReadService | **Authoritative within FR7 bundle scope** (bounded RO collections, not ops sample) | Mostly OK if scoped; labels EN |

Evidence: `getProductionDashboardMetrics` sets `metricsAvailability: "bounded_sample"` and `boundedSampleLimit: 50`. UI hint only on `totalTrips` card.

**MISLEADING KPI COUNT: 6** (all operational count cards).

### 7.2 Exact-safe KPI architecture (proposal — no impl)

Without unbounded Firestore scans:

1. **Never label sample counts as totals.** Rename to “In latest sample (≤50)” / AR equivalent; surface `metricsAvailability` + `truncated` on every card.
2. **Prefer authoritative counters if/when Legacy exposes them** (documented counter docs / aggregation) — only after evidence; do not invent.
3. **Segment KPIs:**
   - **Sampled operational pulse** (current WIF lists) — clearly marked.
   - **FR7 financial KPIs** — keep FR7-only; never recompute on dashboard from trips.
4. **Optional exact-safe patterns later:**
   - Maintained rollup documents written by controlled pipelines (PC-9+).
   - Count aggregation RPIs with server-side capped fan-out + cache — design gate required.
5. **Pilot exclusion:** apply classification (§10) before counting commercial KPIs.

---

## 8. Data-quality issues (Special F/I excerpts)

| ID | Issue | Likely cause | Class | Phase |
|---|---|---|---|---|
| DQ-1 | Raw `cp5_country_*` IDs in Geography | CP5 functional-test country docs in Production `countries` | DATA QUALITY | PC-6 |
| DQ-2 | Inconsistent country labels (ISO filter vs canonical id) | UI hardcodes SA/AE; Prod ids often `saudi_arabia` | WRONG LABEL / FILTER | PC-6 / PC-3 |
| DQ-3 | Countries list `limit: 20` | `listProductionCountriesApi` | MISSING FIELD / truncation | PC-6 |
| DQ-4 | Country display name omitted | `CountryListItem` has id only; canonical `name` unused | MISSING FIELD | PC-6 |
| DQ-5 | Some countries `no_active_agent` | Real coverage gap or inactive agents | DATA QUALITY / ops | PC-6 |
| DQ-6 | Saudi → “Touri Super Admin” as active agent | Possible Legacy `user` with `Isagent` + active window **or** incomplete contamination exclusion on that doc; domain **does** mark `IsAdmin`/`isAdminRule=1` as contaminating (`AgentRoleClassification`) — if still listed, treat as **legacy data contamination** pending live doc evidence (do not assume mapping invents the name) | DATA QUALITY / SECURITY | PC-6 |
| DQ-7 | UID-like / incomplete display names | Missing `display_name`; mapper falls back to id | DATA QUALITY | PC-3 |
| DQ-8 | `test_adminnext_finance_*` in settlements/finance | FR pilot chain docs in Production | DATA QUALITY | PC-10 hygiene; classify PC-1/I |
| DQ-9 | OTP QA driver/customer (live observation) | QA fixtures; markers may be email/name/id prefix | DATA QUALITY | PC-1 strategy |
| DQ-10 | Agent/Driver list counts forced 0 | `mapCanonicalToListItems` | WRONG LABEL | PC-3 |
| DQ-11 | Customer `tripCount` not mapped from canonical | mapper gap | WRONG DATA / FIELD | PC-3 |

**DATA QUALITY ISSUE COUNT: 11**

---

## 9. Users / Audit Production-source decision (Special H)

### 9.1 Users / roles

| Candidate | Evidence | Usable now for `/api/users`? |
|---|---|---|
| Firebase Auth + custom claims (current actor) | `/api/auth/me`, `productionVerifiedAuth`, claims→role mapping docs | **Only for session actor**, not a user directory |
| Legacy Firestore `user` collection | Shared with drivers/agents/customers; admin personas via IsAdmin / isAdminRule | **Not a safe Admin Users SoT** without strict role partition + PII policy |
| Dedicated `admin_users` collection | **Not** in `PRODUCTION_READ_COLLECTION_ALLOWLIST`; `admin_users_mutations` explicitly denied | **Does not exist as Admin Next RO source** |
| In-memory/`@touri.local` fixtures | Dev only; Production fail-closed | Forbidden in Prod |

**PRODUCTION USER SOURCE: NONE CONFIGURED**

**Later controlled phase must create:** Admin Next–owned admin user directory (or verified Auth enumeration design) with role/scope documents, RO allowlist entry, PII masking, and audit of mutations — **do not** mock.

### 9.2 Audit

| Candidate | Evidence | Usable for `/api/audit`? |
|---|---|---|
| Synthetic `AuditRepository` | Dev only | No in Prod |
| `finance_audit_events` | Written by FR1–FR6 pilots; **not** in `FINANCE_REPORTING_RO_COLLECTIONS` | Finance-ops audit only; **not wired** to Audit page |
| Operational admin audit collection | No allowlisted collection for general admin audit | **Missing** |

**PRODUCTION AUDIT SOURCE: NONE CONFIGURED** (for Admin Audit UI)

**Decision:** PC-4 should (1) define operational audit RO collection contract, (2) optionally add finance_audit_events as a **Finance audit** tab with separate permission, (3) never feed synthetic events in Production.

---

## 10. Test / pilot data strategy (Special I)

### 10.1 How records are recognizable today

| Signal | Where | Contractual? |
|---|---|---|
| ID regex `test_`, `test_adminnext_`, `pilot_`, `fr[1-7]_` | `SourceLabel.looksLikePilotOrTestDocumentId` | **Yes** for source-label |
| Prefixes `cp5_`, `demo_`, `golden_`, `qa_` | Driver/Customer/Agent `isTestOrNoncanonical*` | Domain classification |
| Country id `cp5_country_*` | Geography + duplicate audits | Domain |
| Flags `functional_test`, `is_test`, `demo`, `qa_fixture` | Customer/Driver tests | Domain when present on doc |
| Email/name contains `functional test`, `@touri-taxi-test` | Customer audit | Domain |
| FR7 chain constant doc IDs | `FINANCE_FR7_PRODUCTION_CHAIN_DOC_IDS` | Pilot finance |

**Do not rely only on ID prefix for commercial exclusion** when flags/emails exist — combine signals.

### 10.2 Recommended classification (no deletion)

1. Add read-model field `recordClass: operational | pilot | test | unknown` using existing helpers.
2. KPI / finance commercial views default **`operational` only**; toggle “Include pilot/test”.
3. Source badge already elevates to `production_pilot` when pilot IDs present — keep.
4. Geography: hide or badge `testOrNoncanonical` countries by default.
5. Deletion/quarantine = **later controlled-write** phase only.

---

## 11. UX / design issues (Special J)

| Issue | Severity | Phase |
|---|---|---|
| Detail deep-links to dead Production APIs | P0 | PC-1/2 |
| Dashboard totals vs sample | P0 | PC-1 |
| Finance shows camelCase keys | P1 | PC-5 |
| Minimal tables; no column density for ops | P2 | PC-3 / PC-8 |
| Hard-coded synthetic badges on details | P1 | PC-2 |
| Missing SourceLabel on major lists | P2 | PC-1 |
| Shadow nav hides finance while full nav shows it | P2 | PC-8 |
| StatusBadge shows raw enums | P2 | PC-7 |
| RTL: some `text-left` theads; money LTR OK | P2 | PC-7 |
| Mobile tables | P3 | PC-8 |
| Coming Soon settings/support still routable | P3 | PC-8 hide or 404 |
| Notifications stub | P3 | later |

---

## 12. RBAC / action matrix

| Permission | Roles (from `ROLE_PERMISSION_MATRIX`) | Surface today | Prod write |
|---|---|---|---|
| drivers:read | many | List/detail UI | read list OK; detail broken |
| drivers:approve | super_admin, operations_manager, country_admin | Detail actions | disabled |
| trips:read | many | List/detail | detail broken |
| agents:read / agents:manage | … | List/detail | detail broken; manage disabled |
| customers:read / manage / read_pii | … | List/detail | detail broken; manage disabled |
| finance:read | finance roles + others | Finance/Settlements | RO OK |
| settlements:* | split prepare/approve/execute | New link / future | disabled |
| reports:export | … | Reports CSV | RO OK |
| users:manage | super_admin | Users page | source missing |
| audit:read | auditor, super_admin | Audit page | source missing |

**SECURITY/RBAC ISSUE:** Cannot review who has admin access in Production (Users source missing). Actor session RBAC itself is claims-based and fail-closed — good for API, incomplete for governance UI.

---

## 13. Prioritized implementation roadmap

### PC-1 Critical correctness
- Relabel dashboard sample KPIs; show `bounded_sample` on all ops cards.
- Add SourceLabel to Trips/Drivers/Customers/Agents/Geography.
- Document/apply pilot-exclusion toggle design for KPI counts.
- Fail detail links gracefully (“Production detail not enabled”) until PC-2 ships — optional interim UX.

### PC-2 Production detail routes
- Wire trip/driver/customer/agent GET to WIF `getById` / `getSummaryById` + RBAC/scope.
- Map canonical → detail DTOs; truthful source badges.
- No writes.

### PC-3 Operational completeness
- Expand list/detail fields from canonical inventories (C/D/E).
- Fix mapper zeros (agent counts, customer tripCount).
- Country filter use canonical ids + display names.
- Read-only documents/vehicle sections.

### PC-4 Users / Audit
- Decide/create Production admin-user RO source.
- Wire operational audit RO (and optional finance_audit_events view).
- Roles viewer (read-only) from directory + claims.

### PC-5 Finance terminology / report UX
- Apply §6 terminology map in UI only.
- Localize report type names; improve corrections/settlement tables.
- No calculation changes.

### PC-6 Geography / data quality
- Surface country names; cities + landmarks pages via existing repos.
- Badge/filter CP5 and test countries.
- Investigate SA active-agent “Touri Super Admin” with live RO evidence; fix mapping only if contamination classifier miss proven.
- Raise/paginate countries limit safely (≤50 cap / cursor).

### PC-7 Localization / RTL
- Expand `messages.ts` (AR/EN) for statuses, tables, finance, errors.
- Fix thead alignment; locale-aware dates.

### PC-8 Visual polish / responsive
- Mobile list patterns; nav consistency; remove dead Coming Soon or gate routes; notifications placeholder policy.

### PC-9 Controlled write activation (ONLY later)
- Enable resource write flags deliberately; driver/agent/customer/settlement workflows.
- Never as part of PC-1…PC-8.

### PC-10 Final E2E / cutover
- Exclude pilot from commercial dashboards by default.
- Full E2E reconciliation; cutover checklist; synthetic zero verification.

---

## Special audits index

| ID | Topic | Section |
|---|---|---|
| A | Dashboard KPI sample vs total | §7 |
| B | Detail routes | §4 |
| C | Driver management inventory | §3.4–3.6, §5 |
| D | Customer management inventory | §3.7–3.8, §5 |
| E | Agents + one-country-one-agent | §3.9–3.10, §3.16 |
| F | Geography | §3.16–3.19, §8 |
| G | Finance terminology | §6 |
| H | Users/Audit sources | §9 |
| I | Test/pilot strategy | §10 |
| J | Localization/UX | §6, §11 |

---

## Final report card (embedded)

```
PRODUCT COMPLETION AUDIT: FAIL
CURRENT READINESS SCORE: 45/100
COMPLETE SURFACES: 0
PARTIAL SURFACES: 22
BROKEN SURFACES: 6
MISSING SURFACES: 6
BROKEN DETAIL ROUTES: trip, driver, customer, agent (4)
PRODUCTION USER SOURCE: NONE CONFIGURED
PRODUCTION AUDIT SOURCE: NONE CONFIGURED
MISLEADING KPI COUNT: 6
LOCALIZATION ISSUE COUNT: 52
DATA QUALITY ISSUE COUNT: 11
MISSING ACTION COUNT: 12
RECOMMENDED NEXT PHASE: PC-1 Critical correctness
```

**COMPLETE SURFACES (strict):** none fully complete for commercial Production ops.  
**PARTIAL (22):** Dashboard, Trips list, Drivers list, Driver docs/vehicle capability, Customers list, Agents list, Finance, Settlements list, Settlement detail, Settlements new, Reports, Geography countries, Header, Sidebar, Login, Error/Empty/Loading/404, Language/RTL, Responsive, Source-label component usage, Health mapping.  
**BROKEN (6):** Trip detail, Driver detail, Customer detail, Agent detail, Users (Prod), Audit (Prod).  
**MISSING (6):** Cities UI, Landmarks UI, Roles/Permissions UI, Support product, Settings product, Production user/audit sources (capability).

---

*End of audit. No code changes beyond this document. No deploy. No Production writes.*
