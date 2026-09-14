# LEGACY_TO_CANONICAL_FINANCIAL_READ_CONTRACT

## Purpose

Define how a **Legacy Financial Snapshot** (order majors + optional agent snapshot + payment fields) maps to **CanonicalFinancialTripReadModel** without claiming it is a **Ledger**.

Updated **Phase 3.6** — Financial Policy Freeze & Canonicalization.

## Non-claims

- Not Chart of Accounts
- Not double-entry journal
- Not Admin Next SyntheticFinancialPolicy (Phase 2 synthetic is **separate**)
- Not final Production business rules
- Observed Legacy Behavior only

## Mapping rules

1. Prefer **persisted** order fields (`LEGACY_FINANCIAL_SOURCE_PRIORITY` + `CANONICAL_FINANCIAL_SOURCE_PRIORITY_POLICY`).
2. Missing / unproven / not_represented → `value: null` + `availabilityStatus` + provenance.warnings + incompleteReasons. **Never 0.**
3. Concept class **C/D/E** → Production Read must not treat as final number (`isProductionReadableClass`).
4. Platform **amount** `total_app` → Class A / available (FC-01 CLOSED for READ amount). Platform **rate** → null / unknown (Future Policy Decision open — never hardcode 15).
5. Driver net → `total_mndob` available when present; optional derived with formulaId — **not** settlement-eligible by default. DiscountTreatmentPolicy unresolved — do not auto-reduce net by discount (FC-02 READ closed for display).
6. Agent → snapshot or `agentAttributionStatus=unknown_historical` (never current country agent).
7. VAT amount → `total_vat`; `vatRateAtTrip=null` if not proven. No current-country recompute.
8. Chargeback → `not_represented`, amount null (FC-07 READ closed).
9. Gateway fee → null / missing.
10. Safety: `isSafeForDisplay` / `isSafeForSettlement` / `isSafeForAccounting`.
11. `isLedger: false` always.
12. Status/channel unknown → `unmapped` (never nearest neighbor).
13. No historical recalculation when today’s policy changes.

## Implementation

- Types: `src/domain/canonical/CanonicalReadModels.ts`, `FinancialPolicy.ts`, `VatPolicy.ts`, `ChargebackPolicy.ts`, `DiscountTreatmentPolicy.ts`, `FinancialFieldSafety.ts`
- Mapper: `src/domain/canonical/mapLegacyFinancialSnapshot.ts`
- Classification: `FinancialFieldClassification.ts`
- Fixtures: `docs/legacy-mapping/legacy-financial-fixtures.json`
- Decisions: `CANONICAL_FINANCIAL_FIELD_DECISIONS.md`, `FINANCIAL_POLICY_DECISION_REGISTRY.md`
- Tests: `phase35-canonical-contract.test.ts`, `phase36-financial-policy.test.ts`

## Future adapter note (Phase 4+ DESIGN ONLY — not built)

A Production read adapter would: fetch order → map via this contract → attach provenance → refuse to enable if SAFE READ blockers remain. **Not implemented in 3.6.**
