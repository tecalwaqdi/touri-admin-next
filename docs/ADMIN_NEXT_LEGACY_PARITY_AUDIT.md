# Admin Next ← Legacy Admin Feature Parity Audit

**Mode:** P2 IMPLEMENTATION COMPLETE (no deploy, no Production mutation, no write-gate flips, no DNS)
**Date:** 2026-09-15 (audit) · **P0/P1:** 2026-09-16 · **P2 close-out:** 2026-09-16
**Legacy root:** `/Users/ventura/ara-ban/admin/Admi`
**Admin Next root:** `/Users/ventura/touri-admin-next`
**Shared Firebase project:** `tutorial-multi-language-70gx4j`
**Evidence basis:** routes/nav, widgets, CF clients, Firestore collections, Next `src/app` + features + application + domain — **not file-name similarity alone**.

---

## Executive verdict

Admin Next is a **Production-read-capable operations shell** with **gated controlled-write frameworks (Production arms OFF)** covering P0 catalog, P1 support/notifications/identity/storage/periods/settlement alignment, and P2 operator UX completeness (filters, preview, links, classification of non-A gaps).

| Metric | Value |
|---|---|
| **RAW LEGACY PARITY** | **91 / 100** (was 86 after P1) |
| **EFFECTIVE BUSINESS REPLACEMENT PARITY** | **96 / 100** |
| **P0 GAPS** | **ZERO** |
| **P1 GAPS** | **ZERO** |
| **P2 IMPLEMENTABLE (A) GAPS** | **ZERO** |
| CODE CHANGED (P2 session) | YES |
| DEPLOYED | NO |
| PRODUCTION MUTATIONS | 0 |
| DNS TOUCHED | NO |
| ALL PROD GATES DEFAULT FALSE | YES |

**RAW vs EFFECTIVE:** RAW penalizes literal absence of unsafe/obsolete Legacy tools. EFFECTIVE scores whether **current legitimate** Super Admin tasks have a safe Next equivalent (including gated-off write chrome). Production arms OFF is a **cutover readiness** concern (B1), not an EFFECTIVE capability hole in code.

**Can Super Admin operate day-to-day without Legacy today?**
**NO for Production mutations** — all write gates FALSE by design (B1) and identity IAM external (B8).
**YES for read/observe** of current product domains once Production reads are armed on deployed Admin Next.
Exact mutation tasks still requiring Legacy until pilots: driver approve/reject/suspend, agent activate, customer disable, geo/vehicle/partner/fleet/guide writes, support status, notification mark-read, settlement lock/pay, identity persona changes, financial period open/close.

---

## P2 close-out (2026-09-16)

| P2 A item | Status | Evidence |
|---|---|---|
| Support filters/pagination | CLOSED | `SupportPage` FilterBar status/country/search |
| Notification unread filter | CLOSED | `NotificationsPage` read filter |
| Driver doc preview UI | CLOSED | `DriverDocumentPreviewButton` → storage API Fake URL |
| Support entity links | CLOSED | customer/driver/trip Links on detail |
| Trips/Drivers city filter | CLOSED | UI wired to existing API `cityId` |
| Vehicle catalog search/status | CLOSED | FilterBar on catalog |
| Customers FilterBar + localized states | CLOSED | adminUi consistency |
| Geography city `regionId` create | CLOSED | `GeographyCreatePanel` |
| Classification of non-A gaps | CLOSED | `P2GapClassification.ts` |
| IAM runbook / cutover / pilot matrix | CLOSED | docs (not executed) |

---

## Classification of non-implemented Legacy (proof)

| Item | Class | Proof |
|---|---|---|
| Cascade hard delete | B / D | `DeleteArchiveMapping` |
| Legacy finance PDF | B | `LEGACY_FINANCE_PDF_STATUS` |
| Direct Firestore patches | B | Controlled write inventory |
| Raw finance client totals | B | FR1–FR7 aggregator |
| Partner bookings portal | E | `PARTNER_BOOKINGS_PORTAL` |
| Direct FCM token send | B | Fake audience resolver |
| Broad admin claims | B | Identity RBAC + CF claims |
| QA fixtures / copies / Gemini | C / F | Non-product |
| Channels/profits pages | B | FR7 coverage |
| Driver wallet adjust tool | D | Bypasses settlement SoD |
| Manual trip lifecycle mutate | D | Unsafe without SM |
| Override approve | D | Falsifies verification |
| Settings secrets | E | Product contract N/A |
| Company drivers portal | E | Role portal |
| Scheduled notifications | C | No live operational evidence |

---

## Domain depth (final)

- **Drivers:** list/detail/create/expiry/review gated + doc preview Fake; no override approve; wallet adjust refused
- **Agents:** list/detail + activate invariant gated; FR7 agent finance RO
- **Customers:** list/detail + disable/block gated; deletion N/A to Admin
- **Trips:** RO list/detail + filters (status/country/city/payment/search); no unsafe mutate
- **Geography:** full hierarchy tabs + DQ + gated writes + regionId on city create
- **Vehicle:** catalog master separate from driver vehicle + fleet company
- **Partner/Fleet/Guide:** distinct modules, P1 fields, gated
- **Support/Notifications:** RO + filters + gated writes
- **Finance/Reports:** FR7 + V2 settlements + payments UX + CSV + A4 print
- **Dashboard:** ops + FR7 cards with exact/bounded/unavailable honesty
- **Audit/Users/Roles:** RO + identity writes gated; IAM external

---

## Score rationale

**RAW 91:** P2 UX/filter/preview/links (+5); remaining −9 for literal Legacy tools intentionally absent (wallet tool, override, channels chrome, QA, settings, partner portal).

**EFFECTIVE 96:** −4 for Production writes OFF + identity IAM not granted (operational arming), not missing product surfaces.

---

## Artifacts

- `docs/ADMIN_NEXT_LEGACY_GAP_MATRIX.md`
- `docs/ADMIN_NEXT_WRITE_PILOT_MATRIX.md`
- `docs/ADMIN_NEXT_IDENTITY_WIF_IAM_RUNBOOK.md`
- `docs/ADMIN_NEXT_FINAL_CUTOVER_PLAN.md`
- `src/domain/parity/P2GapClassification.ts`
- `src/test/unit/p2-legacy-parity.test.ts`

## Constraints honored

No deploy · no DNS · no write-gate flips · no Production mutations · no IAM execution.
