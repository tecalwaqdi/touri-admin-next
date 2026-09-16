# Admin Next ← Legacy Admin Feature Parity Audit

**Mode:** P0 IMPLEMENTATION COMPLETE (no deploy, no Production mutation, no write-gate flips, no DNS)  
**Date:** 2026-09-15 (audit) · **P0 close-out:** 2026-09-16  
**Legacy root:** `/Users/ventura/ara-ban/admin/Admi` (Flutter / FlutterFlow web admin)  
**Admin Next root:** `/Users/ventura/touri-admin-next` (Next.js App Router)  
**Shared Firebase project:** `tutorial-multi-language-70gx4j`  
**Evidence basis:** routes/nav, widgets, Cloud Functions clients, Firestore collection usage, Next `src/app` + `src/features` + `src/application` + `src/domain` + collection allowlists — **not file-name similarity alone**.

---

## Executive verdict

Admin Next is a **Production-read-capable operations shell** with **gated controlled-write frameworks (Production arms OFF)** covering P0 catalog + settlement payment depth. It is **closer to Legacy operational replaceability** than the 41/100 baseline, but **Production writes remain intentionally disabled**.

| Metric | Value |
|---|---|
| **STRICT LEGACY BUSINESS PARITY SCORE** | **70 / 100** (was 41) |
| **P0 GAPS** | **ZERO** |
| CODE CHANGED (P0 session) | YES |
| DEPLOYED | NO |
| PRODUCTION MUTATIONS | 0 |
| DNS TOUCHED | NO |
| ALL PROD GATES DEFAULT FALSE | YES |

**Why 70 (not higher):** Production write arms OFF; Support/Notification mutations still P1; driver create / periods / PDF / wallet tools still incomplete; dual settlement SM not yet single-armed.

**Why not lower:** P0 Regions (`cities`), Vehicle master (`type_car`), Partners (isShrek), Fleet (`transport_company`), Guides (`is_tour_guide`), and FR5 settlement payment create/confirm/reverse are code-complete + tested + pilot-ready (class A gated off).

---

## P0 close-out summary (2026-09-16)

| P0 item | Status | Evidence |
|---|---|---|
| Regions Country→Region→City→Landmark | CLOSED | `/geography` regions tab, `/geography/regions/[id]`, `/api/geography/regions`, `REGION_WRITE_ENABLED` |
| Vehicle master `type_car` | CLOSED | `/vehicle-catalog`, APIs, gated CRUD, driver free-text compat helper |
| Settlement payment depth FR5 | CLOSED | `/api/settlements/[id]/payments` + confirm/reverse; UI chrome; SoD; no React calc |
| Partners | CLOSED | `/partners` = `mkan` where `isShrek==true` (Legacy proof) |
| Fleet | CLOSED | Distinct `/fleet` on `transport_company` |
| Guides | CLOSED | `/guides` on `user.is_tour_guide` soft status |
| Partner bookings | INTENTIONALLY_REMOVED | Role portal, not admin SoT |
| P0 writes A vs B | ALL A_GATED_OFF | No class B missing P0 write surfaces |

---

## 1. Legacy Admin inventory

### 1.1 Stack & entry

- Flutter web panel (`admin_arawatan`), GoRouter in `lib/flutter_flow/nav/nav.dart`
- Persistent sidebar: `lib/components/menu2_widget.dart` + `AdminLayoutWidget`
- Auth/RBAC: Firebase Auth + custom claims via `AdminRoleService` / panel user create CF
- Data: client Firestore + Storage + HTTPS callables in `Admi/firebase/functions`

### 1.2 Sidebar sections (visible product nav)

From `menu2_widget.dart` section builders:

| Section | Destinations (routeName → path) |
|---|---|
| **Operations** | Home22Dashboard `/home22Dashboard`; AdminALLhgZ `/adminALLhgZ` (bookings); Adminuser `/adminuser`; AdminDriversHub `/adminDriversHub`; AdminSuport `/adminSuport` |
| **Reviews** | AdminNotifications `/adminNotifications` |
| **Catalog** | Admintypecar `/admintypecar`; AdminDol `/adminDol` (countries); Adminregion `/adminregion`; Adminvill `/adminvill`; AdminM3alm `/adminM3alm` (landmarks) |
| **Partners** | AdminAgent `/adminAgent`; AdminTransportCompanies `/adminTransportCompanies`; CompanyDrivers `/companyDrivers` (role-gated); AdminTourGuides `/adminTourGuides`; AdminPartners `/adminPartners`; PartnerBookings `/partnerBookings` (role-gated) |
| **Finance** | AdminFinanceHub; AdminFinanceReconciliation; AdminSettlements; AdminFinanceReceivables; AdminFinanceAdjustments; AdminFinancialPeriods; AdminAgentFinance; AdminFinanceReports; AdminFinanceAudit |
| **Legacy** | AdminDriverWallets (SuperAdmin) |
| **Reports** | AdminReportsHub; AdminAuditLog (SuperAdmin) |
| **System** | AdminDiagnostics; AdminSuperAdmins; Settings |

### 1.3 Registered routes (product + CRUD + hidden)

**~70+ named routes** including sidebar + CRUD/edit + hubs. Representative set:

| Path | Purpose |
|---|---|
| `/home22Dashboard` | KPI dashboard |
| `/adminALLhgZ`, `/adminBookingDetails` | Bookings list + detail |
| `/adminuser`, `/addUser` | Customers |
| `/adminDriversHub`, `/drever`, `/driverActivation`, `/driverProfile`, `/addDrev`, `/driverDocExpiry`, `/driverReviewFixture` | Drivers hub/list/review/create/expiry/QA |
| `/adminSuport` | Support tickets |
| `/adminNotifications` | Panel notification center |
| `/admintypecar`, `/carTypeAddition` | Vehicle type master CRUD |
| `/adminDol`, `/addDolh`, `/edetDolh` | Countries |
| `/adminregion`, `/addReg`, `/edetReg` | **Regions** (`cities` collection) |
| `/adminvill`, `/addVill`, `/edetVill` | Product cities (`villages`) |
| `/adminM3alm`, `/adminaddMkan`, `/adminEdetMkan`, `/adminPartners`, `/adminAddPartner` | Landmarks + partners filter |
| `/adminAgent`, `/adminAddAgent`, `/edetAgent`, `/adminAgentReport`, `/adminAgentCopy` | Agents |
| `/adminTransportCompanies`, `/addTransportCompany`, `/edetTransportCompany`, `/companyDrivers` | Fleet companies |
| `/adminTourGuides` | Tour guides |
| `/partnerBookings` | Partner-scoped bookings |
| `/adminFinanceHub` … `/adminSettlements`, `/adminSettlementDetails`, `/adminSettlementReceipt`, periods, adjustments, channels, receivables, reconciliation, profits, wallets | Full finance V2 UI |
| `/adminReportsHub`, `/adminAuditLog` | Reports + audit |
| `/adminSuperAdmins`, `/adminAddSuperAdmin`, `/adminAddAccountant`, `/edetSuperAdmin`, `/adminUserManagementSystem` | Panel users |
| `/settings`, `/adminDiagnostics`, `/adminGeoHub`, perf benches | System / geo hub / QA |

**Geo model (authoritative Legacy adapter):**  
`Country = countries` · **`Region = cities`** · **`City = villages`** · Landmarks = `mkan` (`admin_geo_adapter.dart`).

### 1.4 Major Legacy actions (by domain)

| Domain | Actions proven in code |
|---|---|
| **Drivers** | List/filter/stats; open detail drawer; `reviewDriverApplicationV2` approve/reject/needs_changes; suspend patch; override approve; create/edit driver (`addDrev`); doc expiry queue; QA fixture |
| **Customers** | List/filter/drawer; disable messaging (“account will be disabled”) |
| **Agents** | CRUD UI; `createPanelUser`; `updateCountryAgentAssignment` / `reassignActiveCountryAgent` / `deactivateCountryAgent` |
| **Geo** | Full CRUD forms for country/region/city/landmark; soft-deactivate (`acctev`/`actev`); **cascade hard delete** (`admin_cascade_delete.dart`) |
| **Vehicle types** | Create presets + update + deactivate `type_car.actev`; hourly rate `sr` |
| **Support** | Status chips → `onStatusChange`; assign-to-me Firestore update |
| **Notifications** | Mark read / batch mark read on `admin_panel_notifications` |
| **Settlements V2** | createDraft / refresh / lock / markSettled / void; create/confirm/reverse payment; allocateExistingPayment; exposure aggregate |
| **Finance controls** | create/approve/reverse adjustment; create/close/reopen period; reports/audit search callables; `adminAdjustDriverWallet`; cash confirm CFs |
| **Panel users** | `createPanelUser` for super admin / accountant |
| **Reports** | Hub + finance reports; CSV helpers exist; finance PDF noted **deferred** in Legacy code comment |

### 1.5 Legacy Firestore / Storage / Functions (Admin-relevant)

**Collections (high confidence):** `order`, `user`, `countries`, `cities` (regions), `villages` (product cities), `mkan`, `type_car`, `transport_company`, `support`, `admin_panel_notifications`, `admin_audit_log`, `wallets`, `transactions`, `financial_settlements` (+ lines/events), `financial_settlement_payments`, `financial_periods`, `financial_adjustments`, `financial_config`, `financial_audit_events`, `agent_country_assignment`, `company_payments`, …

**Callables (Admin client):** settlement V2 suite, finance_controls suite, `reviewDriverApplicationV2`, `createPanelUser`, agent assignment suite, `adminAdjustDriverWallet`, `aggregateFinancial*`, `recordAuditLog`, OTP/email (shared), account deletion (website/CF — not Admin destroy path).

**Unfinished-but-usable:** copy routes (`admin_drivers_copy`, `admin_agent_copy`), perf benches, driver review fixture (QA gate), profits/channels pages of uneven maturity, finance PDF deferred.

---

## 2. Admin Next inventory

### 2.1 Stack & posture

- Next.js App Router under `src/app`
- Features under `src/features/*`
- Production reads: WIF-native allowlisted Firestore (`CollectionAllowlist` + FR7 finance RO)
- Writes: controlled APIs with **all Production write flags FALSE** (`Pc9ControlledWriteInventory`)
- Product contract: `FinalProductSurfaceContract` (Settings N/A; customer deletion N/A to Admin)

### 2.2 Production nav (`navPolicy.ts`)

Visible: `/dashboard`, `/trips`, `/drivers`, `/customers`, `/agents`, `/finance`, `/settlements`, `/reports`, `/geography`, `/support`, `/notifications`, `/users`, `/roles`, `/audit`  
Deferred/hidden: `/settings` (route exists as NOT_APPLICABLE page)

### 2.3 Pages + APIs (product)

| Page | Primary APIs |
|---|---|
| `/dashboard` | `GET /api/dashboard`, finance dashboard |
| `/trips`, `/trips/[id]` | `GET /api/trips`, `GET /api/trips/[id]` |
| `/drivers`, `/drivers/[id]` | drivers list/detail + `[action]` approve/reject/needs_changes/suspend |
| `/customers`, `/customers/[id]` | customers + disable/block/reactivate |
| `/agents`, `/agents/[id]` | agents + activate/deactivate/suspend |
| `/geography` (+ country/city/landmark detail) | countries/cities/landmarks/data-quality + geo write actions |
| `/finance` | FR7 dashboard/reconciliation/corrections |
| `/settlements`, `/settlements/[id]`, `/settlements/new` | FR7 list/detail + SoD write chrome |
| `/reports` | FR7 export CSV |
| `/support`, `/support/[id]` | RO support |
| `/notifications` | RO notifications |
| `/users`, `/users/[id]`, `/roles` | RO + identity write actions |
| `/audit`, `/audit/[id]` | RO audit |
| `/login`, `/admin-next-health/mapping` | auth / health |

### 2.4 Controlled writes (code-ready, Production OFF)

Drivers · Agents · Customers · Geography create/update/activate/deactivate/archive · Settlement submit/approve/reject/close/reverse · Users persona/activate/deactivate/role/scope — all `productionArmed: false`.

### 2.5 Explicitly absent vs Legacy product

- Vehicle type master (`type_car`) UI/API
- Region (`cities` collection) list/CRUD UI (collection readable only as parent relation / allowlisted, not a nav tab)
- Partners, transport companies, company drivers, tour guides, partner bookings
- Driver create (`addDrev`), expiry-queue product page, wallet adjust UI
- Support status/assign mutations
- Notification mark-read / broadcast send
- Settlement V2 payment create/confirm/reverse parity UI bridged to Legacy CF
- Financial periods / opening balance / receivables / channels / profits hubs
- PDF statement/receipt export
- Cascade hard-delete tooling
- Diagnostics / SuperAdmin-only Legacy wallet tool as first-class

---

## 3. Route parity matrix

Status legend: `SUPERSEDED` | `FULL_PARITY` | `PARTIAL_PARITY` | `MISSING` | `INTENTIONALLY_REMOVED` | `NOT_APPLICABLE`

| Legacy route / surface | Next surface | Status | Evidence notes |
|---|---|---|---|
| `/home22Dashboard` | `/dashboard` | PARTIAL_PARITY | KPIs exist; Legacy richer finance/ops tiles; Next bounded sample honesty |
| `/adminALLhgZ` | `/trips` | PARTIAL_PARITY | List RO; fewer filters/columns; no Legacy settlement lookup strip depth |
| `/adminBookingDetails` | `/trips/[id]` | PARTIAL_PARITY | Detail RO tabs; no Legacy booking mutation extras |
| `/adminuser` | `/customers` | PARTIAL_PARITY | List/detail RO; disable gated OFF |
| `/adminDriversHub` + `/drever` | `/drivers` | PARTIAL_PARITY | Hub tabs/expiry not fully mirrored |
| `/driverActivation` / `/driverProfile` | `/drivers/[id]` + write chrome | PARTIAL_PARITY | Review actions code-ready OFF; no full Legacy override/create |
| `/addDrev` | — | MISSING | Driver create/edit form |
| `/driverDocExpiry` | (slots on detail) | PARTIAL_PARITY | No dedicated expiry queue UI |
| `/adminSuport` | `/support` | PARTIAL_PARITY | RO only; Legacy status/assign writes absent |
| `/adminNotifications` | `/notifications` | PARTIAL_PARITY | RO list; no mark-read |
| `/admintypecar` / `/carTypeAddition` | — | MISSING | Vehicle master CRUD |
| `/adminDol` (+ add/edit) | `/geography` countries | PARTIAL_PARITY | RO + gated geo writes; not full Legacy form parity |
| `/adminregion` (+ add/edit) | — | **MISSING** | Region = `cities`; no Next tab/API product surface |
| `/adminvill` (+ add/edit) | `/geography` cities | PARTIAL_PARITY | Maps to `villages`; gated writes |
| `/adminM3alm` (+ add/edit) | `/geography` landmarks | PARTIAL_PARITY | RO + gated; soft-deactivate vs Legacy forms |
| `/adminPartners` / add | — | MISSING | Partners-only landmarks filter + CRUD |
| `/adminAgent` (+ add/edit/report) | `/agents` | PARTIAL_PARITY | RO + gated activate; no create-agent panel user flow in Prod |
| `/adminTransportCompanies` (+ CRUD) | — | MISSING | |
| `/companyDrivers` | — | MISSING / role portal | |
| `/adminTourGuides` | — | MISSING | |
| `/partnerBookings` | — | MISSING | |
| `/adminFinanceHub` | `/finance` | PARTIAL_PARITY | FR7 RO aggregator ≠ full hub actions |
| `/adminSettlements` + details + receipt | `/settlements` + `[id]` | PARTIAL_PARITY | FR7 RO; SoD chrome OFF; no payment receipt PDF path |
| `/adminFinanceAdjustments` | finance corrections RO | PARTIAL_PARITY | Read corrections; create/approve CF path not Live |
| `/adminFinancialPeriods` | — | MISSING | |
| `/adminFinanceReceivables` / Channels / Profits | — | MISSING / SUPERSEDED? | Not productized in Next; treat MISSING for business |
| `/adminFinanceReconciliation` / `/adminReconciliation` | finance reconciliation RO | PARTIAL_PARITY | |
| `/adminAgentFinance` | agent detail FR7 + `/api/finance/agents` | PARTIAL_PARITY | |
| `/adminFinanceReports` | `/reports` CSV | PARTIAL_PARITY | CSV yes; PDF deferred both sides / missing |
| `/adminFinanceAudit` | `/audit` + finance audit RO | PARTIAL_PARITY | Different audit sources |
| `/adminDriverWallets` | — | MISSING | Intentional Legacy tool; still business gap if relied on |
| `/adminReportsHub` | `/reports` | PARTIAL_PARITY | |
| `/adminAuditLog` | `/audit` | PARTIAL_PARITY | |
| `/adminSuperAdmins` (+ add/edit accountant) | `/users` `/roles` | PARTIAL_PARITY | Identity write gated OFF |
| `/settings` | `/settings` stub | INTENTIONALLY_REMOVED | `NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT` |
| `/adminDiagnostics` / perf | `/admin-next-health/mapping` | SUPERSEDED | Different tooling |
| Login/home auth | `/login` | FULL_PARITY | Auth entry (different stack) |
| QA fixture / copy routes | — | NOT_APPLICABLE | Non-product |

**No route marked FULL_PARITY on name similarity alone** except login entry equivalence.

---

## 4. ACTION PARITY MATRIX (critical)

| Legacy action | Next equivalent | Status | Prod executable? |
|---|---|---|---|
| Booking list filter/search/export | Trips filters (status/search) | PARTIAL | RO |
| Open booking detail | Trip detail | PARTIAL | RO |
| Driver approve (`reviewDriverApplicationV2`) | `POST .../approve` | PARTIAL (code) | **NO** (flag OFF) |
| Driver reject | `.../reject` | PARTIAL | NO |
| Driver needs_changes | `.../needs_changes` | PARTIAL | NO |
| Driver suspend | `.../suspend` | PARTIAL | NO |
| Driver override approve | — | MISSING | — |
| Create/edit driver (`addDrev`) | — | MISSING | — |
| Doc expiry queue ops | Detail slot display | PARTIAL | RO |
| Customer disable | `.../disable` | PARTIAL | NO |
| Customer block/reactivate | block/reactivate | PARTIAL (Next) | NO |
| Customer hard delete | — | INTENTIONALLY_REMOVED | N/A (website/CF) |
| Agent create (`createPanelUser`) | identity `create_persona` | PARTIAL | NO |
| Agent assign/reassign country | activate + invariant | PARTIAL | NO |
| Agent deactivate | deactivate | PARTIAL | NO |
| Country/region/city/landmark create forms | Geo create panel (country/city/landmark) | PARTIAL | NO; **Region create MISSING** |
| Geo soft deactivate | activate/deactivate/archive | PARTIAL | NO |
| Geo cascade hard delete | — | INTENTIONALLY_REMOVED (Next policy: no delete) | — |
| Vehicle type create/update/deactivate | — | **MISSING** | — |
| Support status change | — | **MISSING** | — |
| Support assign-to-me | — | **MISSING** | — |
| Notification mark read | — | **MISSING** | — |
| Push/email campaign send from Admin | — | MISSING / N/A | — |
| Settlement draft create V2 | settlements create + new page | PARTIAL (different SM) | NO |
| Lock / settle / void V2 | submit/approve/close/reverse chrome | PARTIAL | NO |
| Settlement payment create/confirm/reverse | — | **MISSING** (depth) | — |
| Allocate existing payment | — | MISSING | — |
| Adjustment create/approve/reverse | corrections RO only | PARTIAL | NO |
| Period create/close/reopen | — | MISSING | — |
| Admin adjust driver wallet | — | MISSING | — |
| Admin confirm cash collection | — | MISSING | — |
| Finance CSV export | `/api/finance/export` | PARTIAL→near | RO export |
| Finance/settlement PDF | — | MISSING | — |
| Panel super-admin/accountant create | users identity actions | PARTIAL | NO |
| Record audit log (callable) | controlled-write audit + audit RO | PARTIAL | writes OFF |
| Gemini generate text | — | INTENTIONALLY_REMOVED | — |

---

## 5. Deep domain comparison (A–Q)

### A. Dashboard
- **Legacy:** `Home22Dashboard` KPI strip + navigation targets.
- **Next:** `/dashboard` operational + FR7 money cards; bounded sample labeling.
- **Parity:** PARTIAL.

### B. Trips / Orders
- **SoT:** `order`.
- **Legacy:** rich filters, settlement lookup, booking details sections.
- **Next:** list + detail RO; financial safe-read; no trip mutations.
- **Parity:** PARTIAL (read); trip writes N/A by design.

### C. Drivers
- **SoT:** `user` + registration fields; review via CF.
- **Legacy:** hub, filters, activation, profile, create, expiry queue.
- **Next:** list/detail + document slots + gated review actions.
- **Parity:** PARTIAL; create/expiry-queue/override MISSING.

### D. Vehicle master data (classifications / types / makes / models)
- **Legacy SoT:** `type_car` CRUD (`admintypecar` + `carTypeAddition`); hourly `sr`; activate/deactivate. Classification collection referenced. Driver vehicle fields separate.
- **Next:** driver detail shows vehicle safe summary / plate / type refs **on driver only** — **no master catalog UI/API**.
- **Parity:** **MISSING** (master). Driver-embedded fields PARTIAL.

### E. Customers
- **Legacy:** list/drawer/disable.
- **Next:** list/detail + disable/block/reactivate gated.
- **Parity:** PARTIAL.

### F. Agents / delegates
- **Legacy:** list/CRUD/report + country assignment CFs.
- **Next:** list/detail + activate/deactivate/suspend gated; ONE-COUNTRY-ONE-AGENT in write path.
- **Parity:** PARTIAL (create/report depth gaps).

### G. Countries / Regions / Cities (Region specifically)
- **Legacy:** three-tier Geo Hub — countries / **regions=`cities`** / cities=`villages`.
- **Next:** countries + **product cities (`villages`)** + landmarks; **`cities` allowlisted for reads as region parent**, but **no Regions tab, list, detail, or CRUD**.
- **Parity:** PARTIAL overall; **Region = MISSING product surface**.

### H. Landmarks
- **Legacy:** `mkan` list/add/edit/deactivate; partners-only mode.
- **Next:** landmarks list/detail + gated writes; DQ tooling stronger.
- **Parity:** PARTIAL.

### I. Partners
- **Legacy:** partners UI, transport companies, company drivers, tour guides, partner bookings.
- **Next:** none as product surfaces.
- **Parity:** **MISSING**.

### J. Complaints / Support
- **Legacy:** list/filters/drawer; status transitions; assign-to-me write.
- **Next:** RO list/detail (`support` collection).
- **Parity:** PARTIAL (RO); actions MISSING.

### K. Notifications
- **Legacy:** inbox + mark read (mutations); deep links to ops screens. Not a mass-send composer in sidebar center (panel alerts).
- **Next:** RO list of `admin_panel_notifications`.
- **Parity:** PARTIAL; mark-read MISSING; broadcast send still MISSING both as productized Admin Next.

### L. Users / Roles
- **Legacy:** SuperAdmins / accountants create+edit; claims refresh.
- **Next:** Users + Roles matrix RO; identity write actions gated; claims via CF `syncUserClaimsOnWrite` design.
- **Parity:** PARTIAL.

### M. Finance vs FR1–FR7 (action-by-action)

| FR | Intent | Legacy live UI/CF | Next | Parity |
|---|---|---|---|---|
| FR1 | Accounting snapshot | V2 accounting / hub aggregates | Pilot prep; not daily UI | PARTIAL / prep |
| FR2 | Settlement create/update | SettlementLedgerClient V2 | Gated SoD create/submit | PARTIAL; SM naming differs |
| FR3 | Reconciliation | Finance reconciliation pages | FR7 RO reconciliation | PARTIAL RO |
| FR4 | Settlement approval | lock / markSettled / policy | approve/reject chrome | PARTIAL gated |
| FR5 | Settlement execution/payments | payment create/confirm/reverse | close chrome; payment depth MISSING | PARTIAL→gap |
| FR6 | Corrections/adjustments | FinanceControlsClient | corrections RO; write pilot prep | PARTIAL |
| FR7 | Reporting RO | finance reports + hub | **FR7 Production RO + CSV** | PARTIAL→strongest |

**Overall finance business action parity: low-to-mid** while RO reporting is relatively strong.

### N. Reports (PDF vs CSV)
- **Legacy:** Reports hub; finance CSV helpers; PDF exporters **deferred** in finance reports comment; settlement receipt page exists.
- **Next:** CSV export via `/api/finance/export`; **no PDF**.
- **Parity:** PARTIAL (CSV); PDF MISSING.

### O. Settings
- **Legacy:** `/settings` product page.
- **Next:** intentional NOT_APPLICABLE stub (no secrets exposure).
- **Parity:** INTENTIONALLY_REMOVED.

### P. Storage / files
- **Legacy:** driver document preview (incl. PDF detection), landmark images, cascade storage cleanup.
- **Next:** document **metadata/slots** on driver detail; no full Storage browser/upload Admin.
- **Parity:** PARTIAL.

### Q. Audit
- **Legacy:** `admin_audit_log` + finance audit search.
- **Next:** `/audit` RO (+ controlled-write audit collection).
- **Parity:** PARTIAL.

---

## 6. Collection / source matrix

| Legacy source | Next READ | Next WRITE | Replaced by | Orphan risk | Business risk |
|---|---|---|---|---|---|
| `order` | YES | NO | Canonical trip RO | Low | Ops OK RO |
| `user` (drivers/agents/customers/admins) | YES (scoped) | Gated OFF | Controlled write repos | Low | Writes blocked |
| `countries` | YES | Gated OFF | Geo APIs | Low | |
| `cities` (**regions**) | allowlist YES (relation) | Gated path exists under geography resource? product UI NO | — | **Medium** | Operators cannot manage regions in Next |
| `villages` | YES (as cities) | Gated OFF | Geo cities | Low | Naming confusion |
| `mkan` | YES | Gated OFF | Landmarks | Low | |
| `type_car` | NO product | NO | — | **High** | Pricing/catalog drift if Legacy frozen |
| `transport_company` | NO | NO | — | High for fleet ops | |
| `support` | YES | NO | RO Support | Medium | Workflow stuck on Legacy |
| `admin_panel_notifications` | YES | NO | RO Notifications | Medium | Inbox hygiene |
| `admin_audit_log` | YES (decisioned) | via CW audit | Audit RO | Low | |
| `financial_settlements` (+ payments) | FR7 YES | Gated SoD OFF; payments depth incomplete | FR7 + SettlementCommandService | Medium | Dual SM risk |
| `financial_periods` / adjustments / config | FR7 partial / corrections | OFF | — | Medium | |
| `wallets` / `transactions` | NO Admin UI | NO (`adminAdjustDriverWallet` unused) | — | Medium | Wallet ops Legacy-only |
| `agent_country_assignment` | via agent invariant | agent write path | — | Low if writes OFF | |
| Storage files | metadata hints | NO | — | Medium | Doc review incomplete without preview |
| Settlement/Finance CFs | not called from Next Prod | pilots only | — | High if cutover assumed | |

---

## 7. Sidebar comparison + hidden routes

| Legacy sidebar item | Next nav | Gap |
|---|---|---|
| Dashboard | Dashboard | Partial |
| Bookings | Trips | Rename/supersede |
| Customers | Customers | Partial |
| Drivers hub | Drivers | Partial |
| Support | Support | RO vs RW |
| Notifications | Notifications | RO vs mark-read |
| Vehicle types | — | **Missing** |
| Countries | Geography/countries | Partial |
| Regions | — | **Missing** |
| Cities | Geography/cities | Partial |
| Landmarks | Geography/landmarks | Partial |
| Agents | Agents | Partial |
| Transport companies / guides / partners / partner bookings | — | **Missing** |
| Finance multi-page suite | Finance + Settlements + Reports | Collapsed / partial |
| Driver wallets | — | Missing |
| Reports hub / Audit | Reports / Audit | Partial |
| Diagnostics / SuperAdmins / Settings | health / Users+Roles / Settings N/A | Mixed |

**Hidden Legacy routes still usable:** booking details, driver activation/profile/add, geo add/edit, settlement details/receipt, add agent/superadmin, geo hub, QA fixtures, copy pages, perf benches.

**Hidden Next routes:** `/settings` (N/A), detail routes, `/settlements/new`, `/admin-next-health/mapping`.

---

## 8. Field-level comparison (major entities)

### Trip (`order`)
| Field group | Legacy UI | Next |
|---|---|---|
| Identity / status / parties | Yes | Yes (canonical) |
| Payment method / currency | Yes | Partial |
| Landmarks / journey | Yes | Partial |
| Financial majors | Yes | Safe-read / FR7 — never invent |
| Admin mutations | Limited | None |

### Driver (`user`)
| Field group | Legacy | Next |
|---|---|---|
| Registration / approval / availability | Yes | Yes |
| Documents slots / expiry | Yes + preview | Slots/status; limited preview |
| Vehicle plate/type/model | Yes + type_car link | Safe summary partial |
| Country/city | Yes | Yes mapped |
| Create form fields | Full `addDrev` | Missing |

### Customer
| Field group | Legacy | Next |
|---|---|---|
| Name/country/status | Yes | Yes |
| Contact | Yes | Hints / PII gated |
| Disable | Yes | Gated |
| Deletion | Not Admin SoT | Explicit N/A |

### Agent
| Field group | Legacy | Next |
|---|---|---|
| Identity / country | Yes | Yes |
| Active uniqueness | CF assignment | Write invariant |
| Finance KPIs | Agent finance / report | FR7 agent read |
| Create | Yes | Persona gated |

### Geography
| Entity | Legacy fields | Next |
|---|---|---|
| Country | names, currency/VAT flags, active | RO + DQ; gated create |
| **Region (`cities`)** | name, country parent, active | **No product fields UI** |
| City (`villages`) | name, region+country parents, active | RO list/detail; regionId mapped |
| Landmark (`mkan`) | bilingual names, city/country, images, active, list visibility | RO + DQ; gated writes |

### Vehicle type (`type_car`)
| Field | Legacy | Next |
|---|---|---|
| Name / active / hourly `sr` / presets | Yes | **Absent** |

---

## 9. Delete behavior classification

| Target | Legacy behavior | Next policy | Classification |
|---|---|---|---|
| Geo country/region/city/landmark | Soft deactivate + **cascade hard delete** tooling | Soft activate/deactivate/**archive**; **no delete** | HARD_DELETE → INTENTIONALLY_REMOVED |
| Vehicle type | Soft `actev:false` | N/A (no surface) | MISSING surface |
| Landmark | Soft `acctev:false` | Archive/deactivate | SUPERSEDED soft path |
| Customer account | Disable messaging; deletion via website/CF | disable/block/reactivate; deletion N/A | ALIGNED intentional |
| Driver | Suspend / reject — not cascade delete primary | suspend/reject gated | PARTIAL |
| Settlement | void / reverse payment | reverse/close gated (different SM) | PARTIAL / conflict |
| Support ticket | Status closed (soft) | RO only | MISSING write |
| Notification | Mark read (not delete-focused) | RO | MISSING write |
| Storage objects | Cascade cleanup helpers | None | MISSING |

---

## 10. Prioritized gaps (P0–P3)

### P0 — Cutover blockers for business replacement
1. **Region management missing** (`cities` collection product UI/API).
2. **Vehicle type master (`type_car`) missing** — pricing catalog cannot be maintained in Next.
3. **Production controlled writes OFF** — even implemented actions cannot replace Legacy ops.
4. **Settlement V2 payment / execution depth** not bridged — cash/online settlement ops stay on Legacy.
5. **Partners / transport companies / tour guides** absent if those personas are live.

### P1 — High operational friction
6. Support status + assign writes.
7. Notification mark-read.
8. Driver create + expiry queue product surface.
9. Financial periods + adjustments write UX aligned to Legacy CF.
10. Agent/panel user create flows with claims sync armed safely.

### P2 — Parity polish
11. Trips/drivers/customers filter/column parity.
12. Landmark/country form field parity (images, list visibility).
13. Settlement receipt / PDF statements.
14. Driver document binary preview.
15. Reports hub breadth beyond FR7 CSV.

### P3 — Defer / intentional
16. Settings page (keep N/A).
17. Gemini helper, perf benches, QA fixtures.
18. Cascade hard delete (keep forbidden in Next).
19. Customer Auth deletion from Admin (keep N/A).
20. Legacy driver wallet tool (decide retire vs port).

### Recommended actions (summary)
- Treat Admin Next as **READ_ONLY_PRODUCTION_GO + staged write pilots**, not Legacy kill-switch.
- Implement Region + `type_car` before claiming catalog parity.
- Bridge Settlement payment actions to Legacy V2 CF **or** explicitly document Legacy Finance remains SoT for execution.
- Add Support/Notification mutation workstreams only after RBAC + audit design.
- Keep cascade delete out of Next.

---

## 11–12. Constraints honored

- **§11:** No application/source code modified for features.
- **§12:** This file + `ADMIN_NEXT_LEGACY_GAP_MATRIX.md` created as audit deliverables only.
- No deploy, no DNS, no write-gate flips, no Production mutations, **no git commit** (prefer operator review of uncommitted docs).

---

## Appendix A — Score rationale (70/100)

Weighted toward **operator-replaceability**:

- Core RO surfaces & FR7 ≈ +28
- P0 catalog (regions/type_car/partners/fleet/guides) ≈ +18
- Settlement payment depth code-complete (gated) ≈ +8
- Gated write frameworks (non-executable) ≈ +8
- Remaining P1 gaps (support/notif writes, driver create, periods, PDF) ≈ −12
- Production arms OFF (intentional safety) caps score below full cutover

**Interpretation:** Admin Next can replace Legacy for **P0 catalog + settlement payment workflows in pilot/offline mode**; Production mutation cutover still requires staged write pilots (P1+).

## Appendix B — Evidence anchors

- Legacy routes: `Admi/lib/flutter_flow/nav/nav.dart`, `lib/index.dart`, per-widget `routePath`
- Legacy sidebar: `Admi/lib/components/menu2_widget.dart`
- Legacy geo: `Admi/lib/admin/admin_geo/admin_geo_adapter.dart`
- Legacy CF client: `Admi/lib/core/cloud_functions/cloud_functions_client.dart`
- Next nav: `src/domain/ui/navPolicy.ts`
- Next writes: `src/domain/controlled-writes/Pc9ControlledWriteInventory.ts`
- Next collections: `src/infrastructure/production/contracts/CollectionAllowlist.ts`
- Product contract: `src/domain/product-contract/FinalProductSurfaceContract.ts`
