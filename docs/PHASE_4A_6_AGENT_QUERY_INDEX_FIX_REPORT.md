# TOURI TAXI ADMIN NEXT — PHASE 4A-6 AGENT QUERY INDEX FIX REPORT

**Date:** 2026-09-12  
**Phase:** 4A-6 fix Agents live query index dependency (offline)  
**Project:** `tutorial-multi-language-70gx4j`  
**Legacy:** `/Users/ventura/ara-ban` READ-ONLY  
**Admin Next:** `/Users/ventura/touri-admin-next`  
**Production calls this session:** **0**  
**Production writes this session:** **0**  
**Production indexes created this session:** **0**  
**PHASE4A6_LIVE_AGENTS:** not executed

---

## Verdict

**CONDITIONAL GO** for one operator-controlled Agents live verification  
(`PHASE4A6_LIVE_AGENTS=1`) after Fake/unit + typecheck + build PASS.

First live failure was a **QUERY DESIGN** blocker (`FAILED_PRECONDITION` composite  
index on `Isagent` + `created_time` + `__name__`) — **not** Agent data / mapping.  
Mapping never ran (`Writes=0`). This fix removes `created_time` from the list query.

**STOP.** Do not create Firestore composite indexes. Do not auto-run live.  
Do not start Customers / Finance.

---

## Root cause

Shadow Agent list used:

```
user where Isagent==true orderBy created_time desc limit ≤50
```

Firestore required a composite index (`Isagent ASC + created_time DESC + __name__ DESC`).  
Query threw `FAILED_PRECONDITION` before any documents returned → mapping never executed.

Additionally, `orderBy created_time` silently excludes Agents missing `created_time`  
(Firestore omits docs lacking the orderBy field). `created_time` is not Agent identity.

---

## Old query shape

```
collection: user
where: Isagent == true
orderBy: created_time desc
limit: ≤50
cursor: startAfter (document id / snapshot)
```

Required composite index → **blocked**.

---

## New query shape

```
collection: user
where: Isagent == true
orderBy: FieldPath.documentId()  // __name__ asc
limit: ≤50
cursor: lastDocumentId → startAfter(id)
NO offset / NO full collection scan / NO created_time orderBy
```

Admin SDK: `orderBy(FieldPath.documentId(), 'asc')` with string `startAfter(lastDocumentId)`.  
Equality on `Isagent` + documentId order uses automatic single-field indexing —  
**no new composite index**.

Constants: `PHASE_4A6_AGENTS_MAX_PAGE=50`, `PHASE_4A6_AGENT_ORDER_FIELD="__name__"`,  
discriminator `Isagent`.

---

## Pagination strategy

| Rule | Implementation |
|---|---|
| Cursor | opaque `lastDocumentId` |
| Advance | `startAfter(lastDocumentId)` |
| Direction | `__name__` ascending |
| Page size | ≤50 (`PHASE_4A6_AGENTS_MAX_PAGE`) |
| Offset | **forbidden** |
| Full scan | **forbidden** |

Fake client sorts by document id for `__name__` and does **not** filter on field existence  
(so Agents without `created_time` remain eligible).

---

## Why created_time was removed

1. Composite index dependency blocked live readiness (`FAILED_PRECONDITION`).  
2. Old Agents may lack `created_time` — orderBy would silently drop them.  
3. Authoritative Agent identity is `user` + `Isagent` (+ mapper alias `isagent`) +  
   `Rev_dloh_agent` — **not** `created_time`.  
4. Pagination readiness must not require timestamp presence.

`created_time` may still appear on mapped models as optional provenance (`createdAtUtc`);  
it is **not** a query/pagination key.

---

## Isagent / isagent alias evidence (Legacy READ-ONLY)

| Source | Behavior |
|---|---|
| `user_record.dart` `createUserRecordData(isagent:…)` | Writes Firestore field **`Isagent`** (Dart param name ≠ field name) |
| `admin_add_agent_widget.dart` | Writes `'Isagent': true` |
| `agent_country_assignment.js` assign/reassign | Patches **`Isagent: true`** |
| `admin_agent_country_lock.dart` | `createUserRecordData(isagent: true)` → **`Isagent`** |
| Admin/Functions list queries | **`where('Isagent','==',true)` only** |
| `panel_claims.js` / `agent_active.js` | **Read** both `Isagent` and `isagent` |
| QA / unit fixtures | May seed lowercase-only `isagent: true` |

**Decision:** Operational writers always persist capitalized **`Isagent`**.  
Lowercase-only docs are theoretical / fixture / claims-defensive — not proven as  
operational Production Agents missing `Isagent`.

**Production list queries required: ONE** bounded query (`Isagent==true` + documentId).  
Mapper + `getById` still accept `isagent` alias with warning.  
**Not** a second list query, **not** a full `user` scan, **not** a generic query API.

---

## Domain rules unchanged

- ONE COUNTRY = ONE ACTIVE AGENT (closing gate retained)  
- Country via `Rev_dloh_agent` only — no country inference  
- Role contamination → `excludedNonAgent` (not `unmappedCountry`)  
- No create / activate / disable / reassign / commission writes  

---

## Query error reporting

Live harness (`phase4a6-live-agents.shadow.test.ts`) +  
`classifyAgentLiveQueryFailure`:

| Condition | overallStatus | blocker | productionReadCompleted | mappingExecuted |
|---|---|---|---|---|
| Index / FAILED_PRECONDITION before docs | NO_GO | `query_index_dependency` | false | false |
| Other query throw before docs | NO_GO | `query_failure` | false | false |
| Mapping / one-active gates | NO_GO | `mapping_or_one_active_agent_gate` | true | true |

Safe `live-safe-summary.json` written in `finally` — no stale PASS, no PII,  
no create-index URL in blocker.

---

## Code changes

| File | Change |
|---|---|
| `FirebaseProductionAgentReadRepository.ts` | `__name__` asc; drop `created_time` orderBy |
| `FirebaseAdminFirestoreReadClient.ts` | `FieldPath.documentId()` + string `startAfter` |
| `FakeFirestoreReadClient.ts` | documentId order without field-existence filter |
| `FirestoreReadClient.ts` | `isDocumentIdOrderField`; index checker allows `__name__` |
| `AgentLiveQueryFailure.ts` | query vs mapping failure classifier |
| `phase4a6-live-agents.shadow.test.ts` | `productionReadCompleted` / `mappingExecuted` |
| `phase4a6-agents-readiness.test.ts` | index-free shape, cursor, missing `created_time`, alias, classifier |

---

## Tests

- Index-free query shape (no `created_time` orderBy)  
- documentId cursor pagination (page ≤50, no offset)  
- Docs missing `created_time` still eligible / mappable  
- Alias: single Isagent list query; lowercase-only via getById only  
- `classifyAgentLiveQueryFailure` → `query_index_dependency`  
- Existing closing gates **not** weakened  

---

## Offline verification

| Check | Result |
|---|---|
| `npm test` | **PASS** — 502 passed, 2 skipped (504) |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Live Production Agents query | **NOT RUN** |
| Firestore indexes created | **0** |

---

## CONDITIONAL GO criteria for operator live

1. Query succeeds without index error (`productionReadCompleted=true`)  
2. `mappingExecuted=true` only after docs returned  
3. `countriesWithMultipleActiveAgents=0`  
4. Closing gates still pass  
5. Production writes = 0  

```
PHASE4A6_LIVE_AGENTS=1 FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/phase4a6-live-agents.shadow.test.ts
```

**This session did not run that command.**

---

## STOP

No index create. No auto Production. No Customers / Finance.
