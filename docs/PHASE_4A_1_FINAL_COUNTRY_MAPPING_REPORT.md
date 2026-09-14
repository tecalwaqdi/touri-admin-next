# TOURI TAXI ADMIN NEXT — PHASE 4A-1 FINAL COUNTRY MAPPING REPORT

**Date:** 2026-09-11  
**Workspace:** `/Users/ventura/touri-admin-next`  
**Legacy reference (READ-ONLY):** `/Users/ventura/ara-ban`  
**Phase:** 4A-1 Final Country Mapping Fix (not Cities / 4A-2)

---

## 1. Confirmed exact three unmapped IDs

Source: `.local/phase4a1-live/live-safe-summary.json` from the Production countries-only read window.

| Stat | Value |
|------|-------|
| recordsRead | 13 |
| recordsMapped (validMapped) | 9 |
| unmapped (unmappedValid) | 3 |
| mappingWarnings | 4 |
| duplicates | 0 |

**Canonical IDs returned (13):**  
`cp5_country_1787562918003`, `spain`, `indonesia`, `portugal`, `morocco`, `saudi_arabia`, **`niger`**, `india`, **`chad`**, `tunisia`, `kyrgyzstan`, `malaysia`, **`nigeria`**

**Already mapped (9):** spain, indonesia, portugal, morocco, saudi_arabia, india, tunisia, kyrgyzstan, malaysia  

**testOrNoncanonical (1):** `cp5_country_1787562918003` / `FUNCTIONAL TEST COUNTRY`  

**Exact unmappedValid (3):** **`niger`**, **`chad`**, **`nigeria`**

Confirmed: these are exactly the three unmapped valid records. Proceeded with mapping.

Paired Production safe names from the same summary:

| Document ID | Production `naim` (safe) |
|-------------|--------------------------|
| `niger` | النيجر |
| `chad` | تشاد |
| `nigeria` | نيجيريا |

---

## 2. Evidence for each mapping

### `niger` → Niger (ISO `NE`)

| Aspect | Evidence |
|--------|----------|
| Firestore doc ID | `countries/niger` (live inventory + Legacy finance census) |
| Arabic `naim` | النيجر (live-safe-summary; matches Legacy label) |
| English identity | `ui_catalog.dart` `ui_e1315f8be8`: ar=النيجر → en=**Niger** |
| Legacy Admin label | `accountant_finance_labels.dart`: id containing `niger` (not `nigeria`) → النيجر |
| ISO alpha-2 | `legacy_africa_geo_compat.js` Africa-three `COMPAT_COUNTRY_CODES` includes **`ne`** / ISO **`NE`** (with city/region prefixes `city_ne_*`, `region_ne_*`) |
| Usage | Admin finance zero-agent country list; not Customer/Driver TouryCountryRegistry preferred set (registry lacked NE — gap closed here by Production ID + Africa-compat ISO) |
| Not test | Distinct from CP5; listed as real zero-agent country in `FINANCE_F3C2D_DEPLOYMENT.md` |

### `chad` → Chad (ISO `TD`)

| Aspect | Evidence |
|--------|----------|
| Firestore doc ID | `countries/chad` |
| Arabic `naim` | تشاد (live-safe-summary) |
| English identity | `ui_catalog.dart` `ui_4ad6b07b0b`: ar=تشاد → en=**Chad** |
| Legacy Admin label | `accountant_finance_labels.dart`: `chad` → تشاد |
| ISO alpha-2 | `legacy_africa_geo_compat.js` **`td`** / **`TD`** |
| Usage | Admin finance + agent-order snapshot tests use `countries/chad`; Customer/Driver registry had no TD preferred id |
| Not test | Real zero-agent country in finance census |

### `nigeria` → Nigeria (ISO `NG`)

| Aspect | Evidence |
|--------|----------|
| Firestore doc ID | `countries/nigeria` |
| Arabic `naim` | نيجيريا (live-safe-summary) |
| English identity | `ui_catalog.dart` `ui_59c7a323d9`: ar=نيجيريا → en=**Nigeria** |
| Legacy Admin label | `accountant_finance_labels.dart`: `nigeria` → نيجيريا (explicitly distinguished from niger) |
| ISO alpha-2 | `legacy_africa_geo_compat.js` **`ng`** / **`NG`** |
| Usage | Admin panel lock / agent assignment / order snapshot tests use `countries/nigeria` |
| Not test | Real zero-agent country in finance census |

**No fuzzy matching:** document IDs and Arabic names are exact equality matches only (`resolveCanonicalCountryId` key equality / alias list membership).

**CP5 preserved:** `cp5_country_1787562918003` / FUNCTIONAL TEST COUNTRY remains classified `test_or_noncanonical` — **no** canonical row or alias added.

---

## 3. Canonical mapping added

Three new `COUNTRY_CANONICAL_TABLE` rows in `CountryCanonicalization.ts`:

| legacyId / canonicalCountryId | name | iso2 | aliases (exact) |
|-------------------------------|------|------|-----------------|
| `niger` | Niger | NE | `niger`, `country_ne`, `النيجر` |
| `chad` | Chad | TD | `chad`, `country_td`, `تشاد` |
| `nigeria` | Nigeria | NG | `nigeria`, `country_ng`, `نيجيريا` |

Confidence: **high** for all three.  
iso3: **null** (not invented).  
No repository query special-case. No live-test exception. Not classified as test/noncanonical.

Expected inventory after fix (this Production snapshot only — not a generic hard-coded rule):

| Stat | Expected |
|------|----------|
| recordsRead | 13 |
| validMapped | 12 |
| testOrNoncanonical | 1 |
| unmappedValid | 0 |
| malformed | 0 |
| duplicates | 0 |

Permanent gates unchanged: `unmappedValid===0`, `malformed===0`, `duplicates===0`.

---

## 4. Files changed

| File | Change |
|------|--------|
| `src/domain/geography/CountryCanonicalization.ts` | +3 evidence-backed rows (niger/chad/nigeria + Arabic aliases + ISO) |
| `src/test/unit/phase4a1-countries-gate.test.ts` | Regression: ID+naim mapping; Arabic alias resolve; CP5 remains testOrNoncanonical |
| `docs/PHASE_4A_1_FINAL_COUNTRY_MAPPING_REPORT.md` | This report |

**Not modified:** Legacy `/Users/ventura/ara-ban`, Production Firestore, repository query, live harness exceptions, write flags, `.env.local` read enablement.

---

## 5. Test counts

```
npm test       → PASS — 239 passed | 1 skipped (live harness gated; PHASE4A1_LIVE_COUNTRIES not auto-rerun)
npm run typecheck → PASS
npm run build  → PASS
```

Regression coverage added:

- `id=niger`, `naim=النيجر` → canonical `niger`
- `id=chad`, `naim=تشاد` → canonical `chad`
- `id=nigeria`, `naim=نيجيريا` → canonical `nigeria`
- Arabic aliases resolve exactly (no fuzzy)
- CP5 remains `testOrNoncanonical` with `unmappedValid=0` in the Africa-three + CP5 seed

---

## 6. Safety

| Control | Status |
|---------|--------|
| Production Firestore calls during implementation | **0** |
| Production writes | **0** |
| Production Read final (committed `.env.local`) | **disabled** (`PRODUCTION_READ_ENABLED=false`, `PRODUCTION_READ_MODE=disabled`, empty `LIVE_SHADOW_ALLOWED_RESOURCES`) |
| Production Write final | **disabled** (all write flags false) |
| Cities / Phase 4A-2 | **not started** |

---

## Final deliverable checklist

```
TOURI TAXI ADMIN NEXT — PHASE 4A-1 FINAL COUNTRY MAPPING REPORT

* confirmed exact three unmapped IDs
  → niger, chad, nigeria (from live-safe-summary; recordsRead=13, mapped=9, unmapped=3)

* evidence for each mapping
  → niger/النيجر→Niger/NE; chad/تشاد→Chad/TD; nigeria/نيجيريا→Nigeria/NG
    (live naim + ui_catalog + finance labels + legacy_africa_geo_compat)

* canonical mapping added
  → three COUNTRY_CANONICAL_TABLE rows (doc IDs + Arabic aliases + iso2)

* files changed
  → CountryCanonicalization.ts, phase4a1-countries-gate.test.ts, this report

* test counts
  → 239 passed | 1 skipped; typecheck PASS; build PASS

* Production Firestore calls during implementation = 0

* Production writes = 0

* Production Read final = disabled

* Production Write final = disabled

* recommendation GO/NO-GO for final countries-only live rerun
  → GO for operator-controlled PHASE4A1_LIVE_COUNTRIES rerun
    (expect validMapped=12, testOrNoncanonical=1, unmappedValid=0)
  → NO-GO for Phase 4A-2 Cities until that live window PASSes.
```

---

## STOP

Phase 4A-2 Cities **not started**.
