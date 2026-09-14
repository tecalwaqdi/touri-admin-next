# Finance Architecture Inspection

**Scope:** Inspection only — no Finance implementation.  
**Date:** 2026-09-13  
**Inputs:** Admin Next (`/Users/ventura/touri-admin-next`) + Legacy read-only (`/Users/ventura/ara-ban`).

---

## 1. Admin Next finance surfaces (today)

| Surface | Status | Notes |
|---|---|---|
| `/finance` | Synthetic hub | Links to Settlements/Reports; shows `SYNTHETIC_TEST_POLICY` (`productionApproved=false`) |
| `/settlements` (+ API) | Synthetic workflow | States: draft→under_review→approved→closed→reversed; dual-control; closes to synthetic CoA journal |
| `/reports` | Synthetic aggregates | Uses `FinancialCalculationService` + in-memory repos |
| Domain | `domain/finance`, `domain/ledger`, `domain/settlement` | Money, eligibility, synthetic CoA (`SYN-*`), VatPolicy draft |
| Controlled Writes | Explicitly exclude finance | `FINANCE_WRITE_ENABLED` must stay false; no wallet/settlement CW |

**Verdict:** Admin Next finance is a **non-production synthetic UX/lab**. It is **not** an accounting source of truth.

---

## 2. Legacy sources of truth (relevant)

### Trip economics (persisted order majors — read SoT)

| Concept | Field | Writer |
|---|---|---|
| Base / driver gross | `order.total_mndob2` | CF / payment-api quote |
| Customer total | `order.total` | CF / payment-api |
| Platform fee amount | `order.total_app` | CF (~15% of base — Observed, not final policy) |
| VAT amount | `order.total_vat` | CF (`countries.isvat` + `countries.vat`) |
| Driver net | `order.total_mndob` | CF: `base − app − vat` |
| Agent share | `order.agent_amount(_minor)` / FIN-9 snapshot | Agent % of platform fee |

### Operational settlement / books

| Artifact | Role |
|---|---|
| `financial_settlements` (+ lines/claims/events/payments) | Settlement V2 header + payments (`settlement_ledger.js`, `settlement_payments.js`) |
| `financial_accounting_v2.js` | Read-only order→accounting lines / eligibility |
| `driver_ledger.js` | Per-driver running balance (cash/online/settlement/adjustment) |
| `finance_controls.js` | Periods, adjustments, opening balance, reconciliation, statements |
| `finance_periods.js` / `finance_policy.js` / flags | Period lock, maker-checker, feature gates |
| `company_payments`, `wallets`, `payment_sessions` | Remittance / wallet / gateway refund sessions (adjacent, not CoA GL) |

Settlement V2 **never** writes orders/wallets/transactions (ledger module contract).

---

## 3. Flow summary

- **Cash:** `pending_cash` → complete → `cash_collected`; driver holds cash; company exposure ≈ customerPaid − driverNet; remittance via settlement payments / company_payments / wallet paths.
- **Card/online:** gateway capture → company holds; driver payable via online remain; refunds via N-Genius session amount (VAT split not recomputed).
- **Commission:** platform = persisted `total_app`; agent = % of platform fee (snapshot when present).
- **VAT:** persisted `total_vat` from country at quote; do not re-rate historically.
- **Settlement / payout:** V2 draft→lock→payments→settled/partially_paid/voided; directions `DRIVER_PAYS_COMPANY` / `COMPANY_PAYS_DRIVER`. SuperAdmin write gate.
- **Refund / chargeback:** refund sessions exist; chargeback pipeline **NOT FOUND** as SoT.
- **Reporting:** competing V1 engine / V2 accounting / V3 snapshot / Admin Next synthetic.

---

## 4. Conflicts / ambiguities

| ID | Issue |
|---|---|
| FC-01 | Platform rate: CF hardcode 15% vs `app_commission_percent` fields |
| FC-02 | Driver net: stored `total_mndob` vs V2 derive-from-`total` when discount |
| FC-05 | Agent attribution historical country-scope vs per-order snapshot |
| FC-07 | Chargeback UI without proven gateway handler |
| FC-09 | Multiple finance engines → same trip, different numbers |
| SM labels | Legacy settlement statuses ≠ Admin Next synthetic states |
| Agent party | Driver↔company proven; agent-as-settlement-party partial/UNRESOLVED |
| Gateway fee | Not on trip pipeline |

---

## 5. Recommended authoritative path (one)

**Trip amounts (historical & settlement eligibility inputs):**  
persisted Firestore **order majors** (`total_mndob2`, `total`, `total_app`, `total_vat`, `total_mndob` + proven payment_status / agent snapshot). **No historical recalculation.**

**Operational accounting / settlement / adjustments / driver exposure:**  
Legacy **Settlement V2 stack** — `financial_accounting_v2` (lines) → `financial_settlements` + `settlement_payments` + `finance_controls` + `driver_ledger`.

**Admin Next synthetic settlement/ledger/policy:** development UX only until an explicit adapter maps to V2 — never parallel production books.

---

## 6. Risks / open questions

1. Policy ownership for platform commission rate (FC-01) before any write design.  
2. Discount treatment for driver net display vs settlement eligibility (FC-02).  
3. Agent settlement party model still unresolved.  
4. Refund/chargeback allocation across platform/agent/driver.  
5. Status-label adapter between Admin Next SM and Legacy V2.  
6. Production hard-lock: keep `FINANCE_WRITE_ENABLED=false` until design + gates approved.

---

## 7. GO / NO-GO

**GO for Finance implementation design** (architecture/adapters/policy decisions only).  

**NO-GO for Finance implementation / Production writes** until design locks the single path above and closes FC-01/FC-02 (and agent-party scope) as explicit decisions.
