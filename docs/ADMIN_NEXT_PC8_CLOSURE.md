# Admin Next PC-8 Closure — Visual Polish & Responsive UX

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-8 Visual Polish & Responsive UX (UI/UX ONLY)  
**Date:** 2026-09-15  
**Baseline:** PC-1..7 PASS (`28861e1112e186b92d28c3bf83e367a7321b1efa`)  
**Commit message:** `style: polish admin responsive production ux`

## Goal

Make Admin Next visually coherent, efficient, responsive, and production-ready for daily administration — without new features, data sources, finance calc changes, DTO/RBAC/WIF/write-gate changes, Production cleanup, mutations, or deploy.

## App shell decisions

| Surface | Decision |
|---|---|
| **AdminShell** | Compact page title (`text-xl`), max width `1440px`, consistent page stack spacing, mobile nav state owned by shell |
| **Sidebar** | Fixed drawer on `<lg`, static on desktop; clear active item; deferred hrefs filtered; scrollable nav for laptop heights |
| **Header** | Sticky; env badge; locale switch; user/role (truncated); logout; **no notifications stub**; mobile menu toggle |
| **Breadcrumb** | Compact, truncation-safe, focus-visible links |
| **Tokens** | Extended existing CSS vars (`--info`, `--success`, shell sizes); shared `adminUi` class tokens — **no new design system / UI library** |

## Table strategy

- Shared `AdminDataTable` + `adminUi.table*` tokens
- Readable density, hover/focus row states, direction-aware headers (`text-start`)
- IDs secondary (`mono` + shorten/truncate + `title`)
- Money cells keep full tabular values (no silent money truncation)

## Mobile strategy

- **Controlled horizontal scroll** for operational tables (`min-w-[44rem]`, `overflow-x-auto`)
- Do **not** shrink 8–13 column tables onto phones
- Single renderer (no duplicated desktop/mobile business logic)
- Sidebar overlay + hamburger preserves access to all implemented routes

## Detail-page pattern

- Shared `DetailField` / `DetailSection` / `SectionTabs`
- Driver detail sections: Overview → Registration → Contact → Vehicle → Documents → Operational → Trips → Finance
- Documents: presence via `StatusBadge`; missing distinguishable; expiry/rejection only when canonical fields exist (DTO currently exposes presence + overall + expiry summary flags)

## Loading / empty / error patterns

| State | Component | Distinction |
|---|---|---|
| Loading | `LoadingState` / `SkeletonBlock` | polite status; no fake values |
| Empty | `EmptyState` | dashed card; **no Create CTA** |
| Error | `ErrorState` | red; retry only when provided |
| Forbidden | `ForbiddenState` | amber |
| Unavailable | `UnavailableState` | slate |
| Source missing | `SourceNotConfiguredState` | sky |
| Not found | `NotFoundState` | white card |
| Deferred | `DeferredSurfaceState` | Support/Settings / gated writes |

## Badge system

Unified sizing/truncation across `StatusBadge`, `SourceLabelBadge`, `GeographyDqBadge` (+ FR7/env chips via `adminUi.badge`). Color is supplemental; labels + `title` / `data-*` remain semantic.

## Responsive findings (~1440 / 1280 / 1024 / 768 / 390)

| Breakpoint | Behavior |
|---|---|
| ~1440 | Full shell + dense KPI grid |
| ~1280–1024 | Sidebar static ≥lg; filters wrap; tables scroll |
| ~768 | Drawer nav; KPI 2-col; header compact |
| ~390 | Drawer + overlay; tables horizontal-scroll; truncation on identity |

## Support / Settings / Notifications policy

| Surface | Production nav | Direct URL | Rationale |
|---|---|---|---|
| **Support** | **Hidden** | Deferred state | No product-ready support surface |
| **Settings** | **Hidden** | Deferred state | No safe config/read surface; do not expose env controls |
| **Notifications** | **Hidden** | N/A (stub removed from header) | No notification center in PC-8 |

Documented in `src/domain/ui/navPolicy.ts`.

## Write chrome policy (PC-9 deferral)

`isControlledWriteChromeEnabled()` (`src/domain/ui/controlledWriteChrome.ts`):

- Production/staging client builds: mutation chrome **hidden** (unless explicit `NEXT_PUBLIC_CONTROLLED_WRITES_UI=true`)
- Development: chrome may render for local rehearsal; **API write gates remain authoritative**
- Settlements “Create” CTA and `/settlements/new` gated the same way

## Route-by-route visual readiness

| Route | Status |
|---|---|
| `/login` | READY |
| `/dashboard` | READY |
| `/trips` | READY |
| `/trips/[id]` | READY |
| `/drivers` | READY |
| `/drivers/[id]` | READY |
| `/customers` | READY |
| `/customers/[id]` | READY |
| `/agents` | READY |
| `/agents/[id]` | READY |
| `/finance` | READY |
| `/settlements` | READY |
| `/settlements/[id]` | READY |
| `/settlements/new` | DEFERRED (write chrome) |
| `/reports` | READY |
| `/geography` (+ city/country/landmark detail) | READY |
| `/users` | READY |
| `/users/[id]` | READY |
| `/roles` | READY |
| `/audit` | READY |
| `/support` | DEFERRED |
| `/settings` | DEFERRED |
| `/admin-next-health/mapping` | DEFERRED (shadow-only) |

**BROKEN visual routes:** none.

### Minor issues (non-blocking)

- Some list pages (Customers/Agents/Users/Finance/Reports) still use local table markup with the same overflow strategy rather than fully migrated `AdminDataTable` wrappers — visually aligned, further consolidation optional.
- Document per-slot expiry/rejection copy awaits richer DTO fields (presentation-only when available).
- New Settlement EN scaffolding remains behind write chrome (PC-9).

## Remaining visual limitations

- No invented charts or KPI exactness cosmetics (PC-1 honesty preserved)
- No notification center / settings editor
- Controlled writes deliberately not polished as primary UX until PC-9

## Intentionally deferred to PC-9 / PC-10

| Item | Phase |
|---|---|
| Controlled write activation + mutation dialogs | PC-9 |
| Production write flag enablement | PC-9 |
| Pilot exclusion default on commercial dashboards | PC-10 |
| Full E2E cutover checklist | PC-10 |

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1631 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Non-regression

- Domain logic / finance values / RBAC: **unchanged**
- FR7 / WIF-native / ADC active=0 / synthetic fallback=0 / write RPCs exposed=0
- Extra API calls / N+1 / new UI library: **none**
- ONE COUNTRY = ONE ACTIVE AGENT unchanged

*End of PC-8 closure.*
