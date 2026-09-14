# Dependency Production Gate

**Rule:** High/critical advisories must be fixed or formally accepted before Production exposure. Never `npm audit fix --force`.

## Current `npm audit` (Phase 3, 2026-09-11)

| Severity | Count | Packages |
|---|---|---|
| critical | 1 | `vitest` (via `@vitest/mocker` when Vitest UI listens) |
| high | 1 | `postcss` (via `next`) |
| moderate | 2 | `@vitest/mocker`, `next`→postcss chain |
| low | 0 | — |

## Gate decisions

| Advisory | Runtime exposure | Decision | Accept until |
|---|---|---|---|
| Vitest critical/moderate | **Dev-only** test runner | **ACCEPT** for Production Read design — not shipped to browser/server runtime | Vitest major upgrade coordinated |
| PostCSS high (via Next 15.5) | Build toolchain | **ACCEPT** — forcing fix pulls Next 16 | Coordinated Next upgrade |

## Production exposure checklist

- [ ] Re-run `npm audit` immediately before any Production Read enablement
- [ ] No forced major upgrades without regression plan
- [ ] Confirm no production Firebase SDK with vulnerable transitive that processes untrusted input
- [ ] Keep `PRODUCTION_READ_ENABLED=false` until gate re-reviewed

**Gate status for Phase 4 design:** CONDITIONAL GO (dev advisories formally accepted; must re-audit).
