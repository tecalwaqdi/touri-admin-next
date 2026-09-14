# TOURI TAXI ADMIN NEXT — PHASE 4A-6 AGENTS READINESS REPORT

**Date:** 2026-09-12  
**Phase:** 4A-6 Agents Production Read readiness (controlled live harness created; **NOT executed**)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  

---

## Verdict

**CONDITIONAL GO** for an **operator-controlled** Agents-only live shadow window  
(`PHASE4A6_LIVE_AGENTS=1`), after Fake/unit + typecheck + build PASS.

**This agent did NOT execute the live Production Agents query.**  
Production Read/Write remain **disabled** in local defaults.

| Gate | Result |
|---|---|
| Fake/unit + typecheck + build | **GO** |
| Operator-controlled Agents live window | **CONDITIONAL GO** (manual only) |
| Auto-run live in CI / agent | **NO-GO** |
| Customers / Finance / Settlements | **NO-GO / not started** |
| Agent create / activate / disable / reassign / commission write | **NO-GO** |

**Agents readiness score: 86 / 100**

**Production calls = 0**  
**Production writes = 0**

---

## 1. Authoritative Agent source

Agents are **not** a separate collection. Shared Firestore **`user`** (same lesson as Drivers Phase 4A-5).

| Surface | Evidence | Collection | Discriminator |
|---|---|---|---|
| **Admin lists** | `dashboard_stats_loader`, `admin_reports_loader`, `admin_country_scope` | `user` | `Isagent == true` |
| **Functions assignment** | `agent_country_assignment.listCountryAgentDocs` | `user` | `Isagent == true` + `Rev_dloh_agent` |
| **Active semantics** | `agent_active.js` `isAgentActiveAt` | `user` | `Isagent` / `isagent` + `actev_user` + date window |
| **Create path** | `admin_add_agent_widget.dart` | `user` | writes `Isagent: true`, `isAdminRule: 2` |
| **Claims** | `panel_claims.js` | `user` | `Isagent`/`isagent` → Auth claim `agent` |

**Authoritative primary for Canonical Agent read:** Firestore collection **`user`** filtered by **`Isagent == true`**.

| Shared with | How separated |
|---|---|
| Drivers | `ismndob` / `ismndom` — orthogonal; not Agent domain |
| Customers | typically `!Isagent && !ismndob` |
| Super admin / finance / partner / transport | Contaminating identities → `excludedNonAgent` (not geography) |

**Typo / alias `isagent`:** accepted as candidate (Functions + claims); primary Admin/Functions **list query uses `Isagent` only**. Docs with only lowercase `isagent` may be missed by the primary query (documented — not client filter-all).

**Prior Phase 4A-0 stub error corrected:** repository previously queried invented `is_agent` + `country_id`. **Replaced** with evidence-backed `Isagent` + `Rev_dloh_agent`.

Resource token: **`agents`**.  
Firestore collection queried: **`user`**.

---

## 2. Discriminator vs role contamination

**Do NOT use one weak boolean as final membership.**

```
isAgentCandidate =
  data.Isagent === true || data.isagent === true

isContaminatingNonAgentIdentity =
  IsAdmin/isAdmin || isAdminRule ∈ {1,3,4,5}
  || is_partner/isPartner
  → roles: super_admin | finance | partner | transport

hasProvenAgentRoleEvidence =
  Rev_dloh_agent || Agent_total || isAdminRule===2
  || app_commission_percent || vat_percent
  || agent_date_reg || agent_date_end || dolh_agent (presence only)

isOperationalAgent =
  isAgentCandidate && !contaminating && hasProvenAgentRoleEvidence
```

**Critical:** `isAdminRule=2` (Legacy `countryAgent` / Auth `country_admin`) is **NOT** contamination — `admin_add_agent` writes both `Isagent: true` and `isAdminRule: 2`. Contaminated rows → **`excludedNonAgent`**, never `unmappedCountry` / malformed geography.

Role model on read model (not collapsed):

| Role | Meaning |
|---|---|
| `agent` | Operational country agent |
| `country_admin` | Panel rule-2 without Isagent (outside Agent domain) |
| `super_admin` / `finance` / `partner` / `transport` | Contaminating if also Isagent |
| `unknown` | Candidate without enough evidence |

Module: `src/domain/agent/AgentRoleClassification.ts`

---

## 3. Identity

| Concept | Source | Notes |
|---|---|---|
| `sourceDocumentId` | Firestore `user/{id}` document id | Canonical list/detail identity |
| `authUid` | `uid` field on the document | Separated when ≠ document id → `authUidKnowledge: mismatch` |
| `canonicalAgentId` | Same as document id | No silent merge across docs |

Auth UID is identity only — **never** authoritative for Agent vs admin role (mirrors Drivers 4A-5 lesson).

---

## 4. Country relation

Reuse CLOSED Phase 4A-1 Countries canonical map.

| Agent field | Target | Mapping |
|---|---|---|
| `Rev_dloh_agent` | `countries/{id}` | `resolveCanonicalCountryId` + **source path preserved** |

**Never** invent country from:

- `dolh_agent` (name string)
- `agent_geo_center` / bounds
- `phone_number` / email
- `agent_country_iso` / `agent_currency_code` / language
- city / GPS

Lock collection `agent_country_assignment/{countryDocId}` is **documented**; list path derives `assignmentLockDocId` from country doc id only — **no N+1 lock fetch**.

---

## 5–9. Operational vs account vs Auth

### Active (SoT: `agent_active.js`)

Active when:

1. `Isagent` / `isagent` === true  
2. `actev_user !== false`  
3. optional `agent_date_reg` / `agent_date_end` contains `now` (corrupt dates → not active)

| Axis | Field(s) | Values | Notes |
|---|---|---|---|
| **account** | `actev_user` | enabled / disabled / unknown | Orthogonal |
| **operationalActive** | account + date window | active / inactive / window_future / window_expired / unknown | SoT for “active agent” |
| **authEnabled** | — | `not_queried` | Auth Admin never called; **Auth enabled ≠ Agent active** |

---

## 10–14. RBAC, financial, PII, duplicates, test markers

### RBAC / scope

- Global / country scope via post-map `countryId` from `Rev_dloh_agent`
- Agent actor scope: self-only (`agentIds`); cannot list/read other agents
- Permissions: `agents:read` (PII permission reserved; FULL_PII stays false)

### Financial fields — DOCUMENT_ONLY (no settlement logic)

| Legacy field | Class | Exposure |
|---|---|---|
| `Agent_total` | commission_rate_percent | DOCUMENT_ONLY |
| `app_commission_percent` | platform_rate_stored | DOCUMENT_ONLY |
| `vat_percent` | vat_rate_stored | DOCUMENT_ONLY |

**Cash / card model (documented, not executed):** agent share is % of platform fee (`total_app`); cash trips do not make the agent a cash float holder; card/online collection is company-side. **No settlement / payout / commission calculation in 4A-6.**

`isAccountingApproved=false`, `isSettlementSafe=false`, `isAuthoritative=false`.

### PII redaction

Blocked on envelope: `phone_number`, `phone_n`, `email`, `photo_url`, `agent_geo_center`, bounds, password.  
`FULL_PII_SHADOW_ENABLED=false` mandatory. Sensitive registry rows added for `resource: agent`.

### Duplicate / conflict audit metrics

Includes: exact document id duplicates, authUid collisions, phoneHash collisions (hashed only), active operational duplicates, partition reconcile.

### CRITICAL BUSINESS RULE — ONE COUNTRY = ONE ACTIVE AGENT

Diagnostics (report only — **no auto-select / disable / merge**):

| Metric | Meaning |
|---|---|
| `activeAgentsPerCountry` | Count of operationally active agents per canonical country |
| `countriesWithNoAgent` | Catalog countries with 0 active |
| `countriesWithOneActiveAgent` | Exactly one active |
| `countriesWithMultipleActiveAgents` | **Must be 0 to close live** |

Closing: `countriesWithMultipleActiveAgents=0`. Domain `AgentAssignmentPolicy` already rejects second active (synthetic path).

### testOrNoncanonical

Only with evidence: id prefixes `cp5_`/`test_`/`demo_`/`golden_`/`qa_`, or flags `functional_test` / `is_test` / `demo` / `qa_fixture`, or known test email markers.

---

## 15–18. CanonicalAgentReadModel + query + writes

### CanonicalAgentReadModel

`src/domain/canonical/CanonicalReadModels.ts` — expanded with identity, membership, account/active axes, country path, lock doc id (derived), DOCUMENT_ONLY rates, mappingStatus (`validMapped` | `unmappedCountry` | `malformed` | `unknownDiscriminator` | `testOrNoncanonical` | `excludedNonAgent`).

Mapper: `src/domain/agent/mapCanonicalAgentRead.ts`

### Bounded query

```
collection: user
where: Isagent == true
orderBy: created_time desc
limit: ≤50
cursor: startAfter document id
NO offset / NO full collection scan
```

Constants: `PHASE_4A6_AGENTS_MAX_PAGE=50`, discriminator `Isagent`.

### Write safety

All write flags false including **`AGENT_WRITE_ENABLED=false`**.  
Shadow trap denies `POST /api/agents/activate`.  
No create / activate / disable / reassign / commission in readiness path.

---

## 19–21. Live harness (SKIP)

File: `src/test/live/phase4a6-live-agents.shadow.test.ts`

- Requires **`PHASE4A6_LIVE_AGENTS=1`**
- Startup allowlist exactly `"agents"` (`PHASE_4A6_LIVE_RESOURCES`)
- Closing gates + partition reconcile wired
- **NOT executed this session**

---

## 22. Offline verification

| Check | Result |
|---|---|
| `npm test` | **PASS** — 497 passed, 2 skipped (live bodies) |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Live Production Agents query | **NOT RUN** |

---

## Score breakdown (/100)

| Area | Score | Notes |
|---|---|---|
| Authoritative source + discriminator | 14/15 | Isagent proven; lowercase alias query gap |
| Role contamination model | 12/12 | Reused Drivers lesson; Admin ≠ Agent |
| Country mapping (4A-1 reuse) | 11/12 | Path preserved; lock not live-verified |
| ONE active agent diagnostics | 12/12 | Multi-active closing gate + no auto-merge |
| Identity / active / Auth separation | 10/10 | Auth enabled never invented |
| Financial DOCUMENT_ONLY + PII | 9/10 | Cash/card noted; settlement blocked |
| Query bounds + write safety | 10/10 | ≤50 cursor; AGENT_WRITE false |
| Offline tests + harness SKIP | 8/9 | Extensive Fake/unit; live not proven |
| Residual Production unknowns | 0/10 | Live multi-active / lock consistency unknown |

**Total: 86 / 100 → CONDITIONAL GO**

---

## GO | CONDITIONAL GO | NO-GO

**CONDITIONAL GO** for one future **operator-controlled** Agents live window  
(`PHASE4A6_LIVE_AGENTS=1`, `LIVE_SHADOW_ALLOWED_RESOURCES=agents`, all writes false, `FULL_PII_SHADOW_ENABLED=false`).

Live must confirm:

1. `countriesWithMultipleActiveAgents=0`
2. `unmappedCountry=0` for operational agents (or evidence-backed exclusions)
3. `excludedNonAgent` rows carry authoritative role evidence
4. Partition reconcile OK  
5. Production writes remain 0

**STOP.** Do not start Customers / Finance / Settlements. Do not enable Production writes.

---

## Code inventory (Phase 4A-6)

| Path | Role |
|---|---|
| `src/domain/agent/AgentRoleClassification.ts` | Membership / contamination |
| `src/domain/agent/AgentActiveSemantics.ts` | Active / account / Auth-not-queried |
| `src/domain/agent/AgentFinancialFieldNotes.ts` | DOCUMENT_ONLY financial inventory |
| `src/domain/agent/AgentDuplicateIdentityAudit.ts` | Audit + one-active-country diagnostics |
| `src/domain/agent/AgentMappingDiagnostic.ts` | Safe live diagnostics / closing gates |
| `src/domain/agent/mapCanonicalAgentRead.ts` | Legacy → CanonicalAgentReadModel |
| `src/domain/agent/isPhase4A6LiveAgentsEnabled.ts` | Live gate helper |
| `src/infrastructure/production/repositories/FirebaseProductionAgentReadRepository.ts` | Production read repo (corrected) |
| `src/test/unit/phase4a6-agents-readiness.test.ts` | Offline suite |
| `src/test/live/phase4a6-live-agents.shadow.test.ts` | Live harness (SKIP default) |

---

```
TOURI TAXI ADMIN NEXT — PHASE 4A-6 AGENTS READINESS REPORT
Agents readiness score: 86 / 100
CONDITIONAL GO
Production calls = 0
Production writes = 0
```
