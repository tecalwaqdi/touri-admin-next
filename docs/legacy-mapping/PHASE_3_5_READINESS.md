# PHASE_3_5_READINESS

## Score V2 (honest)

| Area | Max | Before (P3) | After (P3.5) | Notes |
|---|---:|---:|---:|---|
| Trips | 15 | ~12 | **13** | status_code contract + unmapped; dual-write residual |
| Driver | 10 | ~7 | **8** | axes documented; net mapping clearer |
| Customer | 5 | ~3.5 | **4** | still thin |
| Agent | 10 | ~6 | **8** | 1:1 evidence + FIN-9; historical gap remains |
| Geography | 5 | ~2.5 | **3** | canonicalization plan only |
| Financial | 25 | ~8 | **14** | matrix+traces+contract+fixtures; Critical blockers remain |
| Auth/RBAC | 10 | ~3 | **7** | design+Fake verifier+fail-closed tests; not connected |
| Security | 10 | ~5 | **6** | gaps doc; no rule edits |
| Cloud Functions | 10 | ~7.5 | **8** | settlement/payment traces deepened |
| **Total** | **100** | **43** | **71** | |

## Blocker counts

| Kind | Count |
|---|---:|
| Financial Production Read Blockers (listed) | 13 |
| Critical financial unknowns (rate policy, chargeback, historical agent, incomplete→zero risk, FC-02 policy) | **5** |
| Auth Production Blockers | 4 (no live verify; unmapped roles; claim sync; mock login UI) |
| Critical Unknown Mappings (overall) | **5** |

## 10 Phase 3.5 objective questions (answered with sources)

1. **What is 15%?** Observed CF/payment-api hardcoded platform fee of **base** — not adopted as Production policy. (`ngenius_payments.js`)
2. **Is VAT proven?** Write path yes (`countries.isvat`+`vat`→`total_vat`); rate on order no; inclusive UX UNRESOLVED.
3. **Driver net SoT?** Persisted `total_mndob` from base−app−vat; V2 derive is secondary (FC-02).
4. **Agent finance?** % of platform fee; snapshot FIN-9; settlement inclusion UNRESOLVED.
5. **Cash flow completeness?** Driver hold/owe Observed/Derived; agent remittance Not represented.
6. **Online payments?** N-Genius + webhook duplicate protection Proven; gateway fee / chargeback NOT FOUND.
7. **Settlement V2?** Operational SM Proven; ≠ classic GL; vs Admin Next = Adaptable with Conflicts.
8. **Canonical read ≠ ledger?** Explicit `isLedger:false` + contract doc.
9. **Auth for production?** Designed + Fake tests; **not connected**; fail-closed.
10. **Phase 4 DESIGN ONLY GO?** Requires ≥85, 0 critical unknowns, etc. → **NO-GO** (71, 5 critical unknowns).

## Recommendation

**NO-GO** for Phase 4 DESIGN ONLY.
