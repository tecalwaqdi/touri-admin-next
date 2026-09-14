# Security Dependencies

Documented from `npm audit` during Phase 3 (2026-09-11). Prior Phase 2 notes retained.

**Policy:** Never run `npm audit fix --force`. Safe minor updates OK only if they do not break Next.js 15.

**Production gate:** See [DEPENDENCY_PRODUCTION_GATE.md](./legacy-mapping/DEPENDENCY_PRODUCTION_GATE.md) — high/critical must be fixed or formally accepted before Production exposure.

## Findings

| Package | Severity | Direct/Transitive | Runtime/Dev | Exploitable in Admin Next? | Action |
|---|---|---|---|---|---|
| `@vitest/mocker` (via `vitest`) | moderate | transitive (dev) | **dev** | Low — Vitest path traversal in mock redirect; not shipped to production browser/runtime | **ACCEPT** formally (dev-only) until coordinated vitest upgrade |
| `vitest` (<=4.1.10) | **critical** (UI server path) / moderate | direct (dev) | **dev** | Critical only if Vitest UI server listens with attacker access | **ACCEPT** formally — not production runtime |
| `postcss` (via `next`) | **high** | transitive | build-time (Next bundles postcss) | Limited — attacker-controlled CSS sourceMappingURL / stringify in build toolchain | **ACCEPT** — do not `audit fix --force` (pulls Next 16). Stay on Next 15.5.x |

## Notes

- No Production Firebase SDKs are present; audit findings are tooling/framework transitive issues.
- Production read/write flags remain `false`; dependency CVEs do not enable production data access.
- Re-run `npm audit` at the start of each phase and before any Production Read enablement.
