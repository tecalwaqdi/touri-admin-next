# Admin Next ← Legacy — Concise Gap / Implementation Matrix

**Audit date:** 2026-09-15 (baseline) · **P0/P1:** 2026-09-16 · **P2:** 2026-09-16
**Detail:** `docs/ADMIN_NEXT_LEGACY_PARITY_AUDIT.md`
**RAW LEGACY PARITY:** **91/100** (was 86 after P1)
**EFFECTIVE BUSINESS REPLACEMENT PARITY:** **96/100**
**P0 GAPS:** **ZERO** · **P1 GAPS:** **ZERO** · **P2 IMPLEMENTABLE (A) GAPS:** **ZERO**
**This session:** code + docs · no deploy · no Production mutation · all write gates remain FALSE

Status: `SUPERSEDED` | `FULL_PARITY` | `PARTIAL_PARITY` | `MISSING` | `INTENTIONALLY_REMOVED` | `INTENTIONALLY_SUPERSEDED` | `NOT_APPLICABLE`

---

## 1. Route matrix (condensed)

| Legacy | Next | Status | Priority |
|---|---|---|---|
| Dashboard | `/dashboard` | PARTIAL_PARITY (honest KPI accuracy) | closed P2 polish |
| Bookings list/detail | `/trips`, `/trips/[id]` | PARTIAL_PARITY (+ city filter) | **P2 CLOSED** |
| Customers | `/customers` | PARTIAL_PARITY (FilterBar + localized states) | **P2 CLOSED** |
| Drivers hub/list/review | `/drivers` (+ create/expiry/preview) | PARTIAL_PARITY | **P2 CLOSED** |
| Support | `/support` (+ filters/links/writes gated) | PARTIAL (A_GATED_OFF) | **P1/P2 CLOSED** |
| Notifications | `/notifications` (+ unread filter) | PARTIAL (A_GATED_OFF) | **P1/P2 CLOSED** |
| Vehicle types | `/vehicle-catalog` (+ search/status) | PARTIAL (A_GATED_OFF) | **P0–P2 CLOSED** |
| Countries/Regions/Cities/Landmarks | `/geography` (+ regionId create) | PARTIAL (A_GATED_OFF) | **P0–P2 CLOSED** |
| Agents | `/agents` | PARTIAL_PARITY | P2 polish residual low |
| Partners / Fleet / Guides | `/partners` `/fleet` `/guides` | PARTIAL (A_GATED_OFF) | **P0 CLOSED** |
| Partner bookings | — | INTENTIONALLY_REMOVED | E |
| Finance / Settlements / Periods / Reports | `/finance` `/settlements` `/finance/periods` `/reports` | PARTIAL (gated) | **P0/P1 CLOSED** |
| PDF statements | A4 print HTML | INTENTIONALLY_SUPERSEDED | B |
| Audit / Users / Roles | `/audit` `/users` `/roles` | PARTIAL (identity IAM external) | B8 |
| Settings / Diagnostics / QA | stub / health / — | REMOVED / SUPERSEDED / N/A | C/E |

---

## 2. P2 classification summary (remaining ~14% before P2)

| Class | Count (matrix) | Treatment |
|---|---:|---|
| A SHOULD_IMPLEMENT | 9 → **0 open** | Implemented this session |
| B SUPERSEDED | 8 | Not defects — proven replacements |
| C OBSOLETE | 3 | Not ported |
| D UNSAFE_LEGACY | 3 | Explicitly refused |
| E NOT_CURRENT_PRODUCT | 3 | Outside Admin SoT |
| F DUPLICATE | 1 | Canonical pages only |

Authoritative rows: `src/domain/parity/P2GapClassification.ts`

---

## 3. Domain scorecard (post P2)

| Domain | Status | Score 0–5 |
|---|---|---:|
| Dashboard | PARTIAL | 4.5 |
| Trips | PARTIAL | 4 |
| Drivers | PARTIAL | 4.5 |
| Vehicle master | PARTIAL | 4.5 |
| Customers | PARTIAL | 4 |
| Agents | PARTIAL | 4 |
| Geography | PARTIAL | 4.5 |
| Partners/Fleet/Guides | PARTIAL | 4.5 |
| Support | PARTIAL | 4.5 |
| Notifications | PARTIAL | 4.5 |
| Users/Roles | PARTIAL | 4 |
| Finance FR1–7 | PARTIAL | 4.5 |
| Reports | PARTIAL | 4.5 |
| Audit | PARTIAL | 3.5 |
| Settings | REMOVED | — |

---

## 4. Write readiness

All Production write surfaces remain **A_GATED_OFF**.
Pilot matrix: `docs/ADMIN_NEXT_WRITE_PILOT_MATRIX.md`
Identity IAM runbook: `docs/ADMIN_NEXT_IDENTITY_WIF_IAM_RUNBOOK.md` (not executed)
Cutover plan: `docs/ADMIN_NEXT_FINAL_CUTOVER_PLAN.md` (not executed)

---

## 5. Blockers (cutover — not P2 code gaps)

| Blocker | Why |
|---|---|
| B1 Production writes FALSE | Staged pilots required |
| B8 Identity IAM external | Operator WIF SA grant pending |

---

## 6. Scores

```
RAW LEGACY PARITY: 91/100
EFFECTIVE BUSINESS REPLACEMENT PARITY: 96/100
P0 GAPS: ZERO
P1 GAPS: ZERO
P2 IMPLEMENTABLE GAPS: ZERO
READY FOR FINAL DEPLOYMENT WITH WRITES OFF: YES
READY FOR STAGED WRITE PILOTS: YES (after deploy RO)
DEPLOYED: NO
PRODUCTION MUTATIONS: 0
DNS TOUCHED: NO
ALL PROD GATES DEFAULT FALSE: YES
```

**Why RAW 91 not 100:** literal Legacy satellites (wallet tool, override approve, channels page chrome, QA routes) absent by design.
**Why EFFECTIVE 96:** current legitimate operator tasks have safe Next equivalents (reads + gated writes); Production mutation still requires pilots/IAM (does not reduce effective *capability* completeness, reduces *armed* readiness).
