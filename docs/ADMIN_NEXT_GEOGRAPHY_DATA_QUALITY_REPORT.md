# Admin Next Geography Data Quality Report

**Project:** `/Users/ventura/touri-admin-next`  
**Phase:** PC-6 (findings only — **NO FIXES / NO Production mutations**)  
**Date:** 2026-09-15  
**Baseline commit:** `681172341b8d1b32f53f4bfdac35d3d064567b38`  
**Method:** Code + domain classification on WIF-native bounded reads (≤50). Live Production sample counts in this document are **not** claimed as exact inventory totals unless obtained from a controlled live window outside this phase.

---

## Accuracy disclaimer

All operational geography list metrics from Admin Next Production APIs are **`bounded_sample`** (page ≤50, cursor).  
Do **not** treat UI DQ tab numbers as exact Production totals.

---

## A. Country identity

| Finding | Class | Severity | Evidence |
|---|---|---|---|
| Canonical IDs (e.g. `saudi_arabia`) are authoritative internally | INFO | INFO | `CountryCanonicalization` + `classifyCountryIdentity` → `canonical` |
| Aliases `SA` / `sa` / `demo_saudi` normalize to `saudi_arabia` without writeback | INFO | INFO | alias table + `known_alias` / `legacy` classes |
| `cp5_country_*` fixtures remain listable if returned by repo | DATA QUALITY | ERROR / WARNING | `malformed` / test classification; never aliased to real country |
| Unmapped country document IDs stay `unknown` (not silently rewritten) | DATA QUALITY | ERROR | `classifyCountryIdentity` fail-closed |

---

## B. Display names

| Finding | Class | Severity | Notes |
|---|---|---|---|
| Live `naim` / `name` preferred; else evidence-backed table | CORRECT | — | Never invent missing AR/EN |
| Missing bilingual pair → `status: partial` | DATA QUALITY | WARNING | Primary UI uses available locale; ID shown as secondary mono |
| Raw doc ID must not be the only primary label when a real name exists | UX | WARNING | Detector + presentation helpers |

---

## C. Currency alignment

| Finding | Class | Severity | Notes |
|---|---|---|---|
| Stored vs expected currency compared when both known | DATA QUALITY | WARNING on mismatch | `auditCountryCurrencyAlignment` |
| Missing stored currency → **unavailable** (not default SAR) | DATA QUALITY | WARNING | Explicit `missing_stored` |
| No FX / no conversion | POLICY | — | Intentional |

---

## D. ONE COUNTRY = ONE ACTIVE AGENT

| State | Meaning | Severity |
|---|---|---|
| PASS | Exactly one healthy active agent | — |
| NO_ACTIVE_AGENT | Zero active agents | WARNING |
| VIOLATION | >1 active agents | INVARIANT_VIOLATION |
| DATA_QUALITY_WARNING | Single active agent with admin/contamination signals (e.g. name/role “Super Admin”) | WARNING |

**Specific investigation target (from prior audit DQ-6):**  
Saudi Arabia previously observed with active agent display resembling **“Touri Super Admin”**. PC-6 surfaces this as `DATA_QUALITY_WARNING` when role/name/operational signals match — **does not auto-correct assignment**.

---

## E. Cities

| Detector | Severity | Fix in PC-6? |
|---|---|---|
| Missing / unknown country (`dolh`) | ERROR | No — report only |
| Duplicate names within same country (bounded page) | WARNING | No |
| Missing localized name / ID fallback | WARNING | No |
| Inactive city | INFO | No |
| testOrNoncanonical / malformed mapping | WARNING / ERROR | No |
| Landmark counts per city | unavailable | No efficient aggregate |

---

## F. Landmarks

| Detector | Severity | Fix in PC-6? |
|---|---|---|
| Missing country / city | ERROR | No |
| Country/city mismatch (when expected city country known) | ERROR | No |
| Missing display name | WARNING | No |
| Missing image metadata | WARNING | No — metadata only; **no external image fetch** |
| Missing coordinates | WARNING | No |
| Ambiguous country/city mapping | WARNING | No |
| Category/type | often unavailable | Not invented |

---

## G. QA / pilot / legacy classification

| Class | Evidence used |
|---|---|
| `production` | Valid candidate, no contractual test markers |
| `production_pilot` | Contractual pilot ID **and/or** explicit metadata / mappingStatus |
| `legacy` | Compat city patterns, unmapped fixture prefixes with evidence, legacy aliases |
| `qa` | `qa_` + metadata / fixture signals |
| `unknown` | Pilot-like ID **without** metadata (prefix alone insufficient) |

Records are **not hidden silently**.

---

## H. Metrics deliberately unavailable / bounded

| Metric | Accuracy |
|---|---|
| Country → citiesCount / landmarksCount | `unavailable` |
| City → landmarksCount | `unavailable` |
| DQ summary country/city/landmark tallies | `bounded_sample` |
| Exact Production geography inventory | **Not available** in this phase |

---

## I. Recommended later controlled cleanup (NOT done here)

1. Quarantine or archive `cp5_country_*` / functional-test geography docs (controlled write phase).
2. Resolve Saudi (and any) Super-Admin-as-agent contamination after live RO doc evidence + ops decision.
3. Backfill missing `currency_code` / bilingual names where Legacy Admin can safely write.
4. Deduplicate active+active city/landmark operational collisions already audited in Phase 4A-2/4A-3.

---

*Findings only. No Production mutations performed.*
