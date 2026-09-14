# PLATFORM_COMMISSION_TRACE

## Objective

Prove what the observed **~15%** is and is **not**. Do **not** adopt 15% as final Production policy.

## Evidence (source)

| Claim | Evidence | Confidence |
|---|---|---|
| CF booking quote uses **hardcoded 15** | `ara_oatan_app/firebase/functions/ngenius_payments.js` → `verifiedBookingAmount`: `appFeeHalalas = percentOf(baseFareHalalas, 15)` | **high** |
| Rounding | `percentOf`: `Math.round(amountHalalas * safePercent / 100)` | **high** |
| Tax base for fee | **Base fare** (`baseFareHalalas`), **not** VAT-inclusive customer total | **high** |
| Persisted amount | Written as `order.total_app` via `bookingFinancialMajorsFromQuote` | **high** |
| payment-api default | `calculateBookingQuote`: `platformFeePercent ?? 15`; create path passes `platformFeePercent: 15` (`payments/create.ts`) | **high** |
| Country/user field | `app_commission_percent` validated/stored on agent assignment (`agent_country_assignment.js`) | **high that field exists** |
| Field drives CF quote? | **NOT FOUND** — CF does not read `app_commission_percent` in `verifiedBookingAmount` | **high (negative proof in this function)** |
| Global vs country variance in CF | Literal `15` — **no country branch** in CF quote | **high for CF path** |
| Other app copies | Admin Flutter aggregates **stored** `total_app` (FinancialEngine) — does not recompute 15% | **high** |
| Driver app | Uses order majors / wallet ops; no alternate platform % writer found in Phase 3.5 re-trace | **medium** |

## What 15% is

- **Observed Legacy Behavior** for Customer CF + payment-api default booking quotes.
- Applied to **gross base fare minors**, before discount affects customer `total`.
- Result **persisted** on the order; later Admin V1/V2 **read** that amount.

## What 15% is not (proven / unproven)

| Statement | Verdict |
|---|---|
| Final Touri Production policy for Admin Next | **NOT ADOPTED** — human policy decision required |
| Driven by `countries.app_commission_percent` | **UNRESOLVED / conflicting** (FC-01) |
| Driven by `user.app_commission_percent` | **UNRESOLVED** vs CF |
| VAT-inclusive commission base | **False** for CF (base only) |
| Recalculated at settlement from rate | Settlement uses **stored** platformFeeMinor from accounting line |

## Recalculated elsewhere?

- V2 `analyzeOrder` uses stored `total_app` — does not re-apply 15%.
- Synthetic Admin Next policy also uses 1500 bps — **explicitly non-production**.

## Country variance

- CF: **no** variance (hardcoded).
- Whether production countries *intend* different rates via `app_commission_percent`: **UNRESOLVED** without production data (forbidden here).

## Classification

| Aspect | Class |
|---|---|
| Persisted `total_app` amount | **A** Authoritative persisted |
| Rate source (15 vs field) | **C** Conflicting |
| Future Admin Next policy | **E** Unknown / deferred |

## Blocker

**FIN-BLOCK-01 (FC-01):** Production Read must not present a “platform commission rate” as authoritative until policy chooses CF-hardcode vs field vs new schedule.

## Phase 3.6 Canonical freeze

- **READ rule:** `platformCommissionAmount` = persisted `order.total_app` (high). Do **not** recalculate historical trips with current %.
- **Historical rate:** null unless snapshotted — CF 15 is Observed Legacy only.
- **FC-01:** CLOSED for Production Read **amount** mapping; remains open as **Future Policy Decision** for rate.
- Rates in Admin Next synthetic calc come only from `FinancialPolicyProvider` / `SyntheticFinancialPolicy` — never hardcoded 0.15/15 in `FinancialCalculationService`.
