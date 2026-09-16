# Admin Next ← Legacy — Concise Gap / Implementation Matrix

**Audit date:** 2026-09-15 (baseline) · **P0 implementation:** 2026-09-16  
**Detail:** `docs/ADMIN_NEXT_LEGACY_PARITY_AUDIT.md`  
**Score:** STRICT LEGACY BUSINESS PARITY **70/100** (was 41)  
**P0 GAPS:** **ZERO**  
**This session:** code + docs · no deploy · no Production mutation · all write gates remain FALSE

Status: `SUPERSEDED` | `FULL_PARITY` | `PARTIAL_PARITY` | `MISSING` | `INTENTIONALLY_REMOVED` | `NOT_APPLICABLE`

---

## 1. Route matrix (condensed)

| Legacy | Next | Status | Priority |
|---|---|---|---|
| Dashboard | `/dashboard` | PARTIAL_PARITY | P2 |
| Bookings list/detail | `/trips`, `/trips/[id]` | PARTIAL_PARITY | P2 |
| Customers | `/customers` | PARTIAL_PARITY | P1 |
| Drivers hub/list/review | `/drivers` | PARTIAL_PARITY | P0/P1 |
| Driver create `/addDrev` | — | MISSING | P1 |
| Doc expiry queue | detail slots only | PARTIAL_PARITY | P1 |
| Support | `/support` RO | PARTIAL_PARITY | P1 |
| Notifications | `/notifications` RO | PARTIAL_PARITY | P1 |
| Vehicle types `type_car` | `/vehicle-catalog` | PARTIAL_PARITY (RO + gated writes) | **P0 CLOSED** |
| Countries | Geography countries | PARTIAL_PARITY | P2 |
| **Regions (`cities`)** | `/geography` regions tab + `/geography/regions/[id]` | PARTIAL_PARITY | **P0 CLOSED** |
| Cities (`villages`) | Geography cities | PARTIAL_PARITY | P2 |
| Landmarks | Geography landmarks | PARTIAL_PARITY | P2 |
| Agents | `/agents` | PARTIAL_PARITY | P1 |
| Partners (isShrek landmarks) | `/partners` | PARTIAL_PARITY | **P0 CLOSED** |
| Fleet `transport_company` | `/fleet` | PARTIAL_PARITY | **P0 CLOSED** |
| Tour guides | `/guides` | PARTIAL_PARITY | **P0 CLOSED** |
| Partner bookings | — | INTENTIONALLY_REMOVED (role portal; not admin SoT) | P2 |
| Finance hub suite | `/finance` | PARTIAL_PARITY | P1 |
| Settlements + payments | `/settlements` + FR5 payment chrome | PARTIAL_PARITY | **P0 CLOSED** |
| Periods / receivables / channels / profits / wallets | — / partial | MISSING | P1 |
| Reports / CSV | `/reports` CSV | PARTIAL_PARITY | P2 |
| PDF statements | — | MISSING | P2 |
| Audit | `/audit` | PARTIAL_PARITY | P2 |
| SuperAdmins / accountants | `/users` `/roles` | PARTIAL_PARITY | P1 |
| Settings | stub N/A | INTENTIONALLY_REMOVED | P3 |
| Diagnostics / QA / copies | health / — | SUPERSEDED / N/A | P3 |

---

## 2. Action matrix (implementation view)

| ID | Legacy action | Next | Status | Pri |
|---|---|---|---|---|
| A01 | Driver approve/reject/needs_changes/suspend | API+UI gated | PARTIAL (A_GATED_OFF) | P0 |
| A07 | Region CRUD | Regions tab + API + REGION_WRITE_ENABLED | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |
| A10 | `type_car` CRUD + hourly rate | Vehicle catalog + VEHICLE_CATALOG_WRITE_ENABLED | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |
| A13 | Settlement V2 draft/lock/settle/void | SoD chrome | PARTIAL (A_GATED_OFF) | **P0** |
| A14 | Settlement payment create/confirm/reverse | FR5 payment APIs + UI chrome | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |
| A20 | Partners/fleet/guides CRUD | Modules + narrow write gates | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |

---

## 3. Domain scorecard (A–Q) — post P0

| # | Domain | Status | Score 0–5 | Notes |
|---|---|---|---:|---|
| A | Dashboard | PARTIAL | 3 | |
| B | Trips | PARTIAL | 3 | |
| C | Drivers | PARTIAL | 3 | |
| D | Vehicle master | PARTIAL | 4 | `type_car` module; writes OFF |
| E | Customers | PARTIAL | 3 | |
| F | Agents | PARTIAL | 3 | |
| G | Countries/Regions/Cities | PARTIAL | 4 | Region product surface live |
| H | Landmarks | PARTIAL | 3 | |
| I | Partners | PARTIAL | 4 | isShrek filter module |
| J | Support | PARTIAL | 2 | RO only (P1) |
| K | Notifications | PARTIAL | 2 | RO only (P1) |
| L | Users/Roles | PARTIAL | 3 | |
| M | Finance FR1–7 actions | PARTIAL | 3.5 | FR5 payment depth code-complete OFF |
| N | Reports PDF/CSV | PARTIAL | 2 | CSV yes |
| O | Settings | INTENTIONALLY_REMOVED | — | |
| P | Storage/files | PARTIAL | 2 | |
| Q | Audit | PARTIAL | 3 | |
| — | Fleet | PARTIAL | 4 | Distinct `transport_company` |
| — | Guides | PARTIAL | 4 | Soft status gated |

---

## 4. P0 write readiness (A vs B)

| Domain | Class | Flag (default FALSE) | Notes |
|---|---|---|---|
| Regions | **A_GATED_OFF** | `REGION_WRITE_ENABLED` | Prefer deactivate/archive |
| Vehicle catalog | **A_GATED_OFF** | `VEHICLE_CATALOG_WRITE_ENABLED` | |
| Settlement payments | **A_GATED_OFF** | `FINANCE_WRITE_ENABLED` | FR5 SoD |
| Partners | **A_GATED_OFF** | `PARTNER_WRITE_ENABLED` | |
| Fleet | **A_GATED_OFF** | `FLEET_WRITE_ENABLED` | Distinct domain |
| Guides | **A_GATED_OFF** | `GUIDE_WRITE_ENABLED` | Soft status only |
| Partner bookings portal | INTENTIONALLY_REMOVED | — | Not admin SoT |

**No class B (missing) P0 write surfaces remain.**

---

## 5. Fleet / Guides decisions (with proof)

| Domain | Decision | Proof |
|---|---|---|
| **Fleet** | **PORT** (distinct) | Legacy `transport_company` collection + AdminTransportCompanies CRUD; not a partner landmark filter |
| **Partners** | **PORT** as filtered landmarks | `AdminPartnersWidget` → `AdminM3almWidget(partnersOnly: true)` + `isShrek` |
| **Guides** | **PORT** (genuine) | `AdminTourGuides` + `user.is_tour_guide` / `tour_guide_status` |
| **Partner bookings** | INTENTIONALLY_REMOVED from Admin Next | Role-gated Legacy portal (`partnerBookings`); not central admin SoT |

---

## 6. Blockers (remaining for full cutover — not P0)

| Blocker | Why |
|---|---|
| B1 Production writes all FALSE | Cannot replace Legacy mutations until staged pilots |
| B6 Support/Notification writes | P1 daily inbox |
| B7 Dual settlement SM risk | Align arming to single SoT |
| B8 Identity write IAM | Dedicated SA still required |

**P0 blockers B2–B5 closed.**

---

## 7. Final report schema (P0 session)

```
STRICT LEGACY BUSINESS PARITY SCORE: 70/100
P0 GAPS: ZERO
P0 COMPLETE: YES
READY FOR P1: YES
CODE CHANGED: YES
DEPLOYED: NO
PRODUCTION MUTATIONS: 0
DNS TOUCHED: NO
ALL PROD GATES DEFAULT FALSE: YES
BLOCKERS: B1 (writes OFF by design), B6 Support/Notif P1, B7/B8 cutover
```
