# Admin Next ← Legacy — Concise Gap / Implementation Matrix

**Audit date:** 2026-09-15  
**Detail:** `docs/ADMIN_NEXT_LEGACY_PARITY_AUDIT.md`  
**Score:** STRICT LEGACY BUSINESS PARITY **41/100**  
**This session:** docs only · no deploy · no Production mutation · writes remain OFF

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
| Vehicle types `type_car` | — | MISSING | **P0** |
| Countries | Geography countries | PARTIAL_PARITY | P2 |
| **Regions (`cities`)** | — | **MISSING** | **P0** |
| Cities (`villages`) | Geography cities | PARTIAL_PARITY | P2 |
| Landmarks | Geography landmarks | PARTIAL_PARITY | P2 |
| Agents | `/agents` | PARTIAL_PARITY | P1 |
| Partners / fleet / guides / partner bookings | — | MISSING | **P0** |
| Finance hub suite | `/finance` | PARTIAL_PARITY | P0/P1 |
| Settlements + payments/receipt | `/settlements` | PARTIAL_PARITY | **P0** |
| Periods / receivables / channels / profits / wallets | — / partial | MISSING | P1 |
| Reports / CSV | `/reports` CSV | PARTIAL_PARITY | P2 |
| PDF statements | — | MISSING | P2 |
| Audit | `/audit` | PARTIAL_PARITY | P2 |
| SuperAdmins / accountants | `/users` `/roles` | PARTIAL_PARITY | P1 |
| Settings | stub N/A | INTENTIONALLY_REMOVED | P3 |
| Diagnostics / QA / copies | health / — | SUPERSEDED / N/A | P3 |

---

## 2. Action matrix (implementation view)

| ID | Legacy action | Next | Status | Suggested work | Pri |
|---|---|---|---|---|---|
| A01 | Driver approve/reject/needs_changes/suspend | API+UI gated | PARTIAL | Arm only after synthetic pilot | P0 |
| A02 | Driver override approve | — | MISSING | Spec or drop | P2 |
| A03 | Driver create/edit | — | MISSING | New controlled-write + form | P1 |
| A04 | Customer disable/block | Gated | PARTIAL | Pilot arm | P1 |
| A05 | Agent activate/deactivate/suspend | Gated | PARTIAL | Pilot arm + invariant | P1 |
| A06 | Agent/panel createPanelUser | Identity create_persona gated | PARTIAL | Identity WIF SA + CF | P1 |
| A07 | Region CRUD | — | MISSING | Regions resource UI on `cities` | **P0** |
| A08 | Country/city/landmark CRUD | Gated geo writes | PARTIAL | Field parity + arm | P1 |
| A09 | Geo cascade hard delete | Forbidden | INTENTIONALLY_REMOVED | Keep forbidden | P3 |
| A10 | `type_car` CRUD + hourly rate | — | MISSING | Vehicle master domain | **P0** |
| A11 | Support status + assign | — | MISSING | Support write workstream | P1 |
| A12 | Notification mark-read | — | MISSING | Mutation + audit | P1 |
| A13 | Settlement V2 draft/lock/settle/void | SoD chrome (diff SM) | PARTIAL | Map SM → Legacy V2 CF | **P0** |
| A14 | Settlement payment create/confirm/reverse | — | MISSING | Bridge CF payments | **P0** |
| A15 | Adjustments create/approve | Corrections RO | PARTIAL | FR6 arm + UI | P1 |
| A16 | Periods create/close | — | MISSING | Periods surface | P1 |
| A17 | Wallet adjust / cash confirm | — | MISSING | Decide port vs Legacy-only | P1 |
| A18 | Finance CSV export | Live RO | PARTIAL≈ | Keep | P3 |
| A19 | PDF receipt/report | — | MISSING | Export service | P2 |
| A20 | Partners/fleet/guides CRUD | — | MISSING | Scope product decision | **P0** |

---

## 3. Domain scorecard (A–Q)

| # | Domain | Status | Score 0–5 | Notes |
|---|---|---|---:|---|
| A | Dashboard | PARTIAL | 3 | Bounded KPIs + FR7 |
| B | Trips | PARTIAL | 3 | RO strong; no mutations |
| C | Drivers | PARTIAL | 3 | Review chrome OFF; no create |
| D | Vehicle master | MISSING | 0 | `type_car` absent |
| E | Customers | PARTIAL | 3 | |
| F | Agents | PARTIAL | 3 | |
| G | Countries/Regions/Cities | PARTIAL | 2 | **Region missing** |
| H | Landmarks | PARTIAL | 3 | |
| I | Partners | MISSING | 0 | |
| J | Support | PARTIAL | 2 | RO only |
| K | Notifications | PARTIAL | 2 | RO only |
| L | Users/Roles | PARTIAL | 3 | Writes OFF |
| M | Finance FR1–7 actions | PARTIAL | 2 | FR7 RO best; execution weak |
| N | Reports PDF/CSV | PARTIAL | 2 | CSV yes, PDF no |
| O | Settings | INTENTIONALLY_REMOVED | — | N/A contract |
| P | Storage/files | PARTIAL | 2 | Metadata ≠ full preview |
| Q | Audit | PARTIAL | 3 | |

---

## 4. Collection matrix (ops)

| Collection | Next R | Next W | Action |
|---|---|---|---|
| `order` | Y | N | Keep RO |
| `user` | Y | Gated OFF | Staged write pilots |
| `countries` | Y | Gated OFF | Arm after Region plan |
| `cities` (regions) | relation only | no product | **Build Regions** |
| `villages` | Y (as cities) | Gated OFF | Naming docs for ops |
| `mkan` | Y | Gated OFF | |
| `type_car` | N | N | **Build or keep Legacy** |
| `transport_company` | N | N | Product decision |
| `support` | Y | N | Add writes |
| `admin_panel_notifications` | Y | N | Mark-read |
| `financial_settlements`+payments | FR7 Y | SoD OFF / payments gap | Bridge V2 |
| `financial_periods` / adjustments | partial | N | Port UI |
| `wallets`/`transactions` | N | N | Decision |
| `admin_audit_log` | Y | CW audit | Keep |

---

## 5. Delete policy matrix

| Behavior | Legacy | Next | Implement? |
|---|---|---|---|
| Soft deactivate geo/vehicle | Yes | Archive/deactivate (geo only) | Yes geo; add vehicle later |
| Cascade hard delete | Yes | Forbidden | **Do not port** |
| Customer destroy | Website/CF | N/A Admin | Keep |
| Support close | Soft status | Missing write | Add soft status only |
| Settlement void/reverse | V2 rules | Gated reverse/close | Align to V2 |

---

## 6. Recommended implementation order

1. **Decision freeze:** which Legacy domains remain Legacy-SoT (partners/fleet? wallets? payment execution?).
2. **P0 product gaps:** Regions (`cities`) + Vehicle master (`type_car`) — or explicit INTENTIONALLY_REMOVED with Legacy retention SLA.
3. **P0 finance execution:** map Next settlement SoD → Legacy Settlement V2 CF (incl. payments) **or** document dual-console forever.
4. **P0 write pilots (synthetic):** drivers → agents → customers (existing PC-9/10 packages); Production arms stay false until each passes.
5. **P1 workflow:** Support status/assign; Notification mark-read; Driver create/expiry queue.
6. **P1 identity:** Users/Roles create with dedicated identity-admin WIF + claims CF.
7. **P1 finance controls:** adjustments + periods UI on existing CF contracts.
8. **P2 polish:** filters/columns, PDF, doc preview, reports breadth.
9. **P3:** leave Settings N/A; no cascade delete; no Gemini.

---

## 7. Blockers (cutover)

| Blocker | Why |
|---|---|
| B1 Production writes all FALSE | Cannot replace Legacy mutations |
| B2 Region UI missing | Geo hierarchy incomplete |
| B3 `type_car` missing | Catalog/pricing ops blocked |
| B4 Settlement payment depth | Money movement stays on Legacy |
| B5 Partners/fleet/guides absent | If live personas → hard gap |
| B6 Support/Notification writes absent | Daily inbox workflow incomplete |
| B7 Dual settlement state machines | Risk of wrong books if both write |
| B8 Identity write IAM | Needs dedicated SA; shadow-reader must not gain Auth Admin |

---

## 8. Final report schema (session)

```
STRICT LEGACY BUSINESS PARITY SCORE: 41/100
CODE CHANGED: NO (docs only)
DEPLOYED: NO
PRODUCTION MUTATIONS: 0
RECOMMENDED IMPLEMENTATION ORDER: see §6
BLOCKERS: see §7
DOCS:
  - docs/ADMIN_NEXT_LEGACY_PARITY_AUDIT.md
  - docs/ADMIN_NEXT_LEGACY_GAP_MATRIX.md
COMMIT: none (left uncommitted for review)
```
