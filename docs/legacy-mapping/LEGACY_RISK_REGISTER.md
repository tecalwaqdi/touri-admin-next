# Legacy Risk Register

## CRITICAL LEGACY FINDINGS (do not fix in Phase 3)

| ID | Finding | Evidence |
|---|---|---|
| C-01 | Misleading financial field names in V1 engine (`repCommission` = driver net) | financial_engine.dart |
| C-02 | Platform fee hardcoded 15% in CF while country/user commission fields exist | ngenius_payments.js:223 |
| C-03 | Driver status axes can be collapsed incorrectly in naive UI | admin_driver_status_truth.dart + tests |
| C-04 | Historical agent attribution often country-scope only | finance_agent_attribution.dart |
| C-05 | Dual trip status SoT (status_code + Arabic halh_text) | TourySystemStatusCodes dual-write |

## HIGH

| ID | Risk |
|---|---|
| H-01 | Multiple finance engines (V1/V2/V3) disagree |
| H-02 | Firestore rules drift across Admin/Customer/Driver copies |
| H-03 | Client non-cash accept path still writes order status |
| H-04 | Wallet balance field aliasing |
| H-05 | Geo dual IDs (`city_makkah` vs `city_sa_makkah`, Taif region promotion scripts) — city scoping mismatch risk |
| H-06 | Chargeback not implemented as gateway flow |
| H-07 | Admin Next `x-user-id` header auth (dev only; production must reject) |

## MEDIUM

| ID | Risk |
|---|---|
| M-01 | RTDB unused — any future RTDB assumption wrong |
| M-02 | Payment-api vs CF dual payment surfaces |
| M-03 | Settlement ledger ≠ classic GL |
| M-04 | Pre-existing dirty Legacy tree (hosting artifacts, geo work) — unrelated |

## Geography / city scoping note

Scripts promote Jeddah/Taif/Dammam/etc. to independent city cards and remap `city_makkah` → `city_sa_makkah`. Customer filters (`country_landmark_filter`) and Admin geo aliases exist. **Documented risk:** trip in Taif-scoped village could historically resolve drivers/landmarks via Makkah region shells if aliases incomplete — **do not fix here**; verify on read-only reconciliation later.
