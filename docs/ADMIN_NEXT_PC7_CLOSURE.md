# Admin Next PC-7 Closure — Full App Localization / RTL / LTR

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-7 Full App Localization / RTL / LTR (PRESENTATION ONLY)  
**Date:** 2026-09-15  
**Baseline:** PC-1..6 PASS (`2c18a840927db6d4d6c0fd4224d4ee5b8e1fa830`)  
**Commit message:** `feat: complete admin localization and rtl support`

## Goal

Make the entire Admin Next interface professionally usable in Arabic and English: localization, terminology consistency, RTL/LTR, formatting, and visual direction — without feature work, data cleanup, writes, finance calculation changes, or deploy.

## Translation architecture

**ONE canonical i18n system** (unchanged framework):

| Piece | Role |
|---|---|
| `src/i18n/namespaces/*` | Semantic catalogs: common, navigation, dashboard, trips, drivers, users, geography, dataQuality |
| `src/i18n/messages.ts` | Merges namespaces → flat `messages` + `t(locale, key)` + `MessageKey` |
| `src/i18n/I18nProvider.tsx` | Client locale/`dir`; sets `document.documentElement.lang` + `dir` |
| `src/domain/presentation/financeTerminology.ts` | Authoritative finance labels (PC-5) — not duplicated |
| `src/domain/presentation/statusPresentation.ts` | Authoritative status/payment labels |
| `src/domain/geography/GeographyPresentation.ts` | Authoritative country/city display names (PC-6) |
| `src/domain/presentation/rolePresentation.ts` | Role display names (keys unchanged) |
| `src/domain/presentation/permissionPresentation.ts` | Permission descriptions (keys unchanged) |

Suggested namespaces documented in `I18N_NAMESPACES` (finance/settlements/reports remain served by PC-5 maps).

## Routes audited

Login · Header · Sidebar · Dashboard · Trips · Trip detail · Drivers · Driver detail · Customers · Customer detail · Agents · Agent detail · Finance · Settlements · Settlement detail · Reports · Geography (countries/cities/landmarks/DQ) · Country/City/Landmark detail · Users · User detail · Roles · Audit · loading/empty/forbidden/error/unavailable/not-found · filters · pagination · source badges · write-action chrome (labels only).

## Status / role / permission / source / DQ mappings

- **Statuses:** expanded `presentStatus` (trip lifecycle, registration, settlement, DQ, etc.). Unknown → localized “Unknown” / “غير معروف”; domain retained on `data-status-domain` / `title`.
- **Payment methods:** `presentPaymentMethod` (canonical values unchanged).
- **Roles:** `super_admin` → المسؤول العام / Super Admin, etc.
- **Permissions:** e.g. `finance:read` → عرض البيانات المالية / View financial data.
- **Source labels:** locale-aware badge; classification logic unchanged (`production`, `production_pilot`, `unavailable`, `development_synthetic`).
- **DQ:** INFO→معلومات, WARNING→تنبيه, ERROR→خطأ في البيانات, INVARIANT_VIOLATION→مخالفة قاعدة النظام.

## RTL / mixed-direction / tables

- `ar` → `dir=rtl`, `en` → `dir=ltr` on document + AdminShell / Login.
- `LtrIsolate` for emails, IDs, currency codes, correlation/audit IDs, plates-style mono values.
- Tables use `text-start` (direction-aware); no blind `text-right` on numerics.
- Sidebar uses logical `border-e`; header uses `ms-*` margins.

## Formatters

| Helper | Behavior |
|---|---|
| `formatDateTime` / `FormattedDateTime` | Locale-aware UTC medium datetime; no raw ISO by default; ISO in tooltip |
| `formatCount` | Locale-aware counts |
| `formatIdentifier` | Never locale-formats IDs |
| Money | Continues PC-5 `formatReportMoney` / `MoneyCell` |

## Residual localization audit

### Untranslated normal UI strings remaining
- None known on audited Production chrome for normal operator paths.
- Write confirm copy still contains short English glue (“for driver/agent/customer”) around localized action names — acceptable residual for PC-8 polish if desired.

### Intentional technical strings
- Brand mark “Touri Taxi” in sidebar.
- Currency codes (SAR/AED/…), status domain values in `title` / `data-*` attributes.
- Filter **values** remain canonical enums (`pending_review`, `PASS`, …) while labels localize.
- Permission/role **keys** retained in `title` / `data-role-key` / `data-permission-key` for diagnostics.
- JSON before/after snapshots on Audit detail (machine payloads).

### Known exceptions
- Support / Settings “Coming soon” placeholders remain gated/unimplemented (PC-8 product policy).
- New Settlement page still has minimal English scaffolding (writes disabled).

## Verification

| Check | Result |
|---|---|
| `npm test` | PASS (1601 passed, 5 skipped) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Non-regression

- Domain enums / canonical IDs / finance calculations / RBAC: **unchanged**
- PC-1..6 semantics preserved; FR7 presentation continues via `financeTerminology`
- WIF-native reads; ADC active=0; Production synthetic fallback=0; writes disabled
- ONE COUNTRY = ONE ACTIVE AGENT unchanged

## Remaining for PC-8

| Item | Notes |
|---|---|
| Visual / responsive polish | Mobile list patterns, denser spacing, truncation polish |
| Nav consistency | Support/Settings policy; notifications placeholder |
| Write confirm copy | Full AR sentences for controlled-write confirmations |
| New Settlement scaffolding | Localize remaining EN when writes approach (PC-9) |
| Optional bilingual source badge | Currently locale-aware single string (by design) |

*End of PC-7 closure.*
