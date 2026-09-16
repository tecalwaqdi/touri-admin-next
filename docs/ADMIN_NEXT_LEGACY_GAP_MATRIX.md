# Admin Next ← Legacy — Concise Gap / Implementation Matrix

**Audit date:** 2026-09-15 (baseline) · **P0:** 2026-09-16 · **P1:** 2026-09-16
**Detail:** `docs/ADMIN_NEXT_LEGACY_PARITY_AUDIT.md`
**Score:** STRICT LEGACY BUSINESS PARITY **86/100** (was 70 after P0)
**P0 GAPS:** **ZERO**
**P1 GAPS:** **ZERO**
**This session:** code + docs · no deploy · no Production mutation · all write gates remain FALSE

Status: `SUPERSEDED` | `FULL_PARITY` | `PARTIAL_PARITY` | `MISSING` | `INTENTIONALLY_REMOVED` | `INTENTIONALLY_SUPERSEDED` | `NOT_APPLICABLE`

---

## 1. Route matrix (condensed)

| Legacy | Next | Status | Priority |
|---|---|---|---|
| Dashboard | `/dashboard` | PARTIAL_PARITY (P1 KPIs honest unavailable) | P2 polish |
| Bookings list/detail | `/trips`, `/trips/[id]` | PARTIAL_PARITY | P2 |
| Customers | `/customers` | PARTIAL_PARITY | P2 |
| Drivers hub/list/review | `/drivers` | PARTIAL_PARITY | P2 |
| Driver create `/addDrev` | `/drivers/create` + gated API | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| Doc expiry queue | `/drivers/expiry` | PARTIAL (surface live; source-bound) | **P1 CLOSED** |
| Support | `/support` + gated writes | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| Notifications | `/notifications` + mark-read/compose Fake | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| Vehicle types `type_car` | `/vehicle-catalog` + P1 fields | PARTIAL (A_GATED_OFF) | **P0/P1 CLOSED** |
| Countries | Geography countries | PARTIAL_PARITY | P2 |
| **Regions (`cities`)** | `/geography` regions | PARTIAL + cascade integration | **P0/P1 CLOSED** |
| Cities (`villages`) | Geography cities | PARTIAL_PARITY | P2 |
| Landmarks | Geography landmarks + image workflows | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| Agents | `/agents` | PARTIAL_PARITY | P2 |
| Partners (isShrek landmarks) | `/partners` + P1 fields | PARTIAL (A_GATED_OFF) | **P0/P1 CLOSED** |
| Fleet `transport_company` | `/fleet` + P1 fields | PARTIAL (A_GATED_OFF) | **P0/P1 CLOSED** |
| Tour guides | `/guides` + P1 fields | PARTIAL (A_GATED_OFF) | **P0/P1 CLOSED** |
| Partner bookings | — | INTENTIONALLY_REMOVED | — |
| Finance hub suite | `/finance` + `/finance/periods` | PARTIAL (periods gated) | **P1 CLOSED** |
| Settlements + payments | `/settlements` + V2 SM + payment UX + print | PARTIAL (A_GATED_OFF) | **P0/P1 CLOSED** |
| Periods / receivables / channels / profits / wallets | periods module; others via FR7 | PARTIAL / INTENTIONALLY_SUPERSEDED uneven Legacy | **P1 CLOSED** |
| Reports / CSV | `/reports` + localized export headers | PARTIAL_PARITY | **P1 CLOSED** |
| PDF statements | Printable A4 settlement HTML; Legacy PDF deferred | INTENTIONALLY_SUPERSEDED (+ print parity) | **P1 CLOSED** |
| Audit | `/audit` | PARTIAL_PARITY | P2 |
| SuperAdmins / accountants | `/users` `/roles` + identity IAM contract | PARTIAL (A_GATED_OFF; IAM external pending) | **P1 CLOSED** |
| Settings | stub N/A | INTENTIONALLY_REMOVED | P3 |
| Diagnostics / QA / copies | health / — | SUPERSEDED / N/A | P3 |

---

## 2. Action matrix (implementation view)

| ID | Legacy action | Next | Status | Pri |
|---|---|---|---|---|
| A01 | Driver approve/reject/needs_changes/suspend | API+UI gated | PARTIAL (A_GATED_OFF) | P0 |
| A07 | Region CRUD | Regions + REGION_WRITE_ENABLED | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |
| A10 | `type_car` CRUD + hourly rate | Vehicle catalog + VEHICLE_CATALOG_WRITE_ENABLED | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |
| A13 | Settlement V2 draft/lock/settle/void | SoD chrome; **V2 authoritative** | PARTIAL (A_GATED_OFF) | **P0/P1** |
| A14 | Settlement payment create/confirm/reverse | FR5 + full payment UX + print | PARTIAL (A_GATED_OFF) | **P0/P1 CLOSED** |
| A20 | Partners/fleet/guides CRUD | Modules + narrow write gates | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |
| A30 | Support status/assign/note/resolve | SUPPORT_WRITE_ENABLED | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| A31 | Notification mark-read / compose panel | NOTIFICATION_WRITE_ENABLED + Fake push | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| A32 | Driver create | DRIVER_WRITE_ENABLED | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| A33 | Identity persona writes | ADMIN_IDENTITY_WRITE_ENABLED + IAM contract | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| A34 | Financial periods open/close/lock | FINANCE_WRITE_ENABLED | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |
| A35 | Landmark image replace/archive | GEOGRAPHY/PARTNER gates + canonical Storage | PARTIAL (A_GATED_OFF) | **P1 CLOSED** |

---

## 3. Domain scorecard (A–Q) — post P1

| # | Domain | Status | Score 0–5 | Notes |
|---|---|---|---:|---|
| A | Dashboard | PARTIAL | 4 | P1 KPI slots with unavailable honesty |
| B | Trips | PARTIAL | 3 | P2 filters |
| C | Drivers | PARTIAL | 4 | create + expiry surfaces gated |
| D | Vehicle master | PARTIAL | 4.5 | P1 field depth |
| E | Customers | PARTIAL | 3.5 | |
| F | Agents | PARTIAL | 3.5 | |
| G | Countries/Regions/Cities | PARTIAL | 4.5 | Region cascade helpers |
| H | Landmarks | PARTIAL | 4 | Image workflows gated |
| I | Partners | PARTIAL | 4.5 | |
| J | Support | PARTIAL | 4 | Writes gated OFF |
| K | Notifications | PARTIAL | 4 | Mark-read + Fake compose |
| L | Users/Roles | PARTIAL | 4 | Identity architecture complete; IAM external |
| M | Finance FR1–7 | PARTIAL | 4.5 | Dual-SM blocker cleared; periods + payment UX |
| N | Reports PDF/CSV | PARTIAL | 4 | CSV + A4 print; Legacy PDF superseded |
| O | Settings | INTENTIONALLY_REMOVED | — | |
| P | Storage/files | PARTIAL | 4 | Canonical paths; Fake preview |
| Q | Audit | PARTIAL | 3 | |
| — | Fleet | PARTIAL | 4.5 | |
| — | Guides | PARTIAL | 4.5 | |

---

## 4. P1 write readiness (A vs B)

| Domain | Class | Flag (default FALSE) | Notes |
|---|---|---|---|
| Support | **A_GATED_OFF** | `SUPPORT_WRITE_ENABLED` | Status/assign/note/resolve |
| Notifications | **A_GATED_OFF** | `NOTIFICATION_WRITE_ENABLED` | Mark-read + compose; Fake push |
| Financial periods | **A_GATED_OFF** | `FINANCE_WRITE_ENABLED` | open/close/lock |
| Identity admin | **A_GATED_OFF** | `ADMIN_IDENTITY_WRITE_ENABLED` | IAM external step pending |
| Driver create | **A_GATED_OFF** | `DRIVER_WRITE_ENABLED` | `/drivers/create` |
| Landmark images | **A_GATED_OFF** | `GEOGRAPHY_WRITE_ENABLED` / `PARTNER_WRITE_ENABLED` | No arbitrary paths |
| Settlement payments | **A_GATED_OFF** | `FINANCE_WRITE_ENABLED` | V2 authoritative |

**No class B (missing) P1 write surfaces remain.**

---

## 5. Fleet / Guides / PDF decisions (with proof)

| Domain | Decision | Proof |
|---|---|---|
| **Fleet** | PORT (distinct) | `transport_company` + P1 field mapper |
| **Partners** | PORT as filtered landmarks | `isShrek` + P1 fields; bookings portal INTENTIONALLY_REMOVED |
| **Guides** | PORT | `user.is_tour_guide` + P1 fields |
| **Legacy finance PDF** | INTENTIONALLY_SUPERSEDED | Comment in `admin_finance_reports_widget.dart`: exporters deferred; Next uses A4 printable HTML |

---

## 6. Blockers (remaining for full cutover — not P1 gaps)

| Blocker | Why |
|---|---|
| B1 Production writes all FALSE | Staged pilots required before Legacy mutation replacement |
| B8 Identity IAM external | Dedicated identity-admin WIF SA not granted this phase (app code ready) |
| B7 Dual settlement SM | **CLEARED** — V2+FR1–7 authoritative; synthetic SM offline-only |

**P0 blockers B2–B5 closed. P1 B6 Support/Notif closed in code (gated OFF).**

---

## 7. Final report schema (P1 session)

```
STRICT LEGACY BUSINESS PARITY SCORE: 86/100
P0 GAPS: ZERO
P1 GAPS: ZERO
P1 COMPLETE: YES
READY FOR P2: YES
CODE CHANGED: YES
DEPLOYED: NO
PRODUCTION MUTATIONS: 0
DNS TOUCHED: NO
ALL PROD GATES DEFAULT FALSE: YES
BLOCKERS: B1 (writes OFF by design), B8 identity IAM external (operator)
```
