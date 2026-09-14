# PHASE_4A_1_OPERATOR_CHECKLIST

Controlled **countries-only** Production Shadow Read.  
Mark **PASS** only with non-secret evidence. Do **not** paste tokens, private keys, or Service Account JSON into chat, Git, or this file.

**Live connection rule:** Start live Auth/Firestore **only if every box below is PASS**. Otherwise leave flags DISABLED and record NO-GO.

---

## A. Phase / code readiness

| # | Item | Evidence (non-secret) | PASS? |
|---|---|---|---|
| A1 | Phase 4A-0 complete; regression green before 4A-1 work | `npm test` / typecheck / build PASS recorded | ☐ |
| A2 | Admin Next preflight for 4A-1 green | `npm test && npm run typecheck && npm run build` PASS | ☐ |
| A3 | Production Read default DISABLED | `PRODUCTION_READ_ENABLED=false`, `PRODUCTION_READ_MODE=disabled` | ☐ |
| A4 | All write flags false | `PRODUCTION_WRITE_*` / domain write flags false | ☐ |
| A5 | `FULL_PII_SHADOW_ENABLED=false` | env | ☐ |
| A6 | `LIVE_SHADOW_ALLOWED_RESOURCES=countries` ready for window | env plan; code gate present | ☐ |
| A7 | Kill switch understood | Flip `PRODUCTION_READ_ENABLED=false` denies next request | ☐ |
| A8 | No private key markers in Admin Next repo/docs | scan: no `BEGIN PRIVATE KEY` | ☐ |
| A9 | Legacy tree not modified by Admin Next work | baseline status/diff unchanged by this phase | ☐ |

## B. Production project fingerprint

| # | Item | Evidence | PASS? |
|---|---|---|---|
| B1 | Fingerprint doc written from Legacy configs only | `docs/phase4a/PRODUCTION_PROJECT_FINGERPRINT_REVIEW.md` | ☐ |
| B2 | Human confirms `EXPECTED_PROJECT_ID` is **real Production Touri Taxi** (not folder/alias alone) | Operator sign-off name + date (no secrets) | ☐ |
| B3 | Auth project / Storage bucket / Functions region reviewed | Fingerprint table | ☐ |
| B4 | Ambiguous `demo-touri-taxi` rejected unless explicitly Production | Operator note | ☐ |

## C. Dedicated Shadow Read identity & IAM

| # | Item | Evidence (non-secret identifier + roles + project only) | PASS? |
|---|---|---|---|
| C1 | Dedicated Admin Next Shadow Read identity (NOT Owner/Editor/Firebase Admin full / Legacy deploy SA / personal Owner) | SA email local-part + domain OR WI principal id | ☐ |
| C2 | Firestore IAM = `roles/datastore.viewer` only | IAM review log | ☐ |
| C3 | Confirmed **absence** of `datastore.user` / `datastore.admin` / Editor / Owner / `firebase.admin` | IAM review log | ☐ |
| C4 | Auth verify (if needed) = `roles/firebaseauth.viewer` only | IAM review log | ☐ |
| C5 | Confirmed **absence** of Auth editor/admin | IAM review log | ☐ |
| C6 | No Storage Admin / CF Admin / Secret Manager Admin / Hosting / PubSub / Scheduler / Payment / write roles | IAM review log | ☐ |
| C7 | Credential via Secret Manager / Workload Identity preferred; if local key file: **outside repo**, restricted perms, path in local env only, cleanup/rotation documented | path exists check only / SM resource name | ☐ |
| C8 | Credential is **not** Legacy `firebase-adminsdk-*` deploy SA | identity identifier | ☐ |
| C9 | ADC / user creds alone are **not** used as the Shadow identity | note | ☐ |

## D. Monitoring

| # | Item | Evidence | PASS? |
|---|---|---|---|
| D1 | Sink beyond InMemory activated for live window | `PRODUCTION_READ_OBSERVABILITY_SINK=structured_logger` or `file_ndjson` | ☐ |
| D2 | File sink path (if used) under gitignored `.local/` | path exists; not committed | ☐ |
| D3 | Events scrubbed (no tokens / PII / private keys) | sample event types only | ☐ |

## E. Auth pilot (before Firestore)

| # | Item | Evidence | PASS? |
|---|---|---|---|
| E1 | Pilot read-only auditor available (prefer **not** Super Admin) | role name only | ☐ |
| E2 | Valid Production ID token path prepared (not pasted into chat) | operator holds token out-of-band | ☐ |
| E3 | Auth success criteria understood: issuer, audience, not expired/revoked/disabled, recognized role+scope | checklist note | ☐ |
| E4 | Auth failure probes planned: missing/invalid/wrong-project/unknown role/`x-user-id` → DENY | plan | ☐ |

## F. Live window controls

| # | Item | Evidence | PASS? |
|---|---|---|---|
| F1 | Enablement window start/end recorded | timestamps UTC | ☐ |
| F2 | First query = `listCountries` only, limit ≤20 | plan | ☐ |
| F3 | Cities / order / user / settlements / payment / storage **not** queried | plan | ☐ |
| F4 | End state: `PRODUCTION_READ_ENABLED=false`, `PRODUCTION_READ_MODE=disabled` | env after window | ☐ |
| F5 | Credential cleanup/rotation status recorded (no secret value) | note | ☐ |
| F6 | If IAM permission denied: do **not** widen to Owner/Editor | policy ack | ☐ |
| F7 | Index surprise → STOP (no index deploy) | policy ack | ☐ |
| F8 | No Security Rules / Cloud Functions / Legacy code changes | policy ack | ☐ |

---

## Gate decision

| Decision | Condition |
|---|---|
| **GO live 4A-1 window** | All boxes PASS |
| **NO-GO** | Any box open / FAIL — keep Production Read DISABLED; do not start 4A-2 |

**Recorded decision:** NO-GO (live countries data query blocked — `FIREBASE_ID_TOKEN` unset in executing agent shell; no bypass)  
**Operator:** Admin Next Phase 4A-1 live retry agent  
**Date (UTC):** 2026-09-11  

### Live retry notes (2026-09-11, second attempt)

| Area | Result |
|---|---|
| A preflight (test/typecheck/build) | PASS (pre + post window) |
| B fingerprint (ADC probe actual) | PASS / MATCH (`tutorial-multi-language-70gx4j`) |
| C Shadow SA IAM read-only | PASS (`datastore.viewer` + `firebaseauth.viewer` only; IAM not modified) |
| D monitoring sink beyond memory | PASS (file_ndjson under `.local/`) |
| E Auth Client wiring | PASS (code + ADC probe); pilot ID token in agent shell | **FAIL / MISSING_TOKEN** |
| F countries live query | NOT EXECUTED (Auth stop; 0 Firestore queries) |
| Final flags | Read DISABLED; all writes DISABLED |

See `docs/PHASE_4A_1_LIVE_COUNTRIES_REPORT.md`.
