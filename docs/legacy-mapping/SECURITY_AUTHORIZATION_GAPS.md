# SECURITY_AUTHORIZATION_GAPS

Read-only gap analysis. **No rule edits.**

## Layers

| Layer | Assumption | Gap |
|---|---|---|
| App (Flutter Admin) | Route matrix via AdminRoleService; agents via CF | Client-side UX can hide actions but is not SoT |
| Cloud Functions | Callables check auth + checker policies | Some client writes still exist for non-cash trip status (Phase 3 risk) |
| Firestore Rules | isAdminRule 1–5 + country scoping + agent snapshot immutability | Three rules file copies → drift risk |
| Storage Rules | Path prefixes + catch-all | Catch-all risk documented Phase 3 |
| Admin Next | Dev header auth; prod rejects x-user-id | Real verifyIdToken not wired; partner/transport fail-closed |

## App vs CF vs Rules vs Admin Next roles

| Concern | App | CF | Rules | Admin Next |
|---|---|---|---|---|
| Super admin | Full | Claims super_admin | isAdminRule 1 | super_admin mapped |
| Country admin | Scoped UI | country_admin claim; no finance | Country scoped | country_admin mapped |
| Accountant | Finance read UI | finance claim rule 5 | finance paths | accountant mapped |
| Agent | Agent screens | agent claim + lock | Agent country | agent_user mapped |
| Partner / transport | Present | claims exist | Present | **UNMAPPED — deny** |
| Cash accept | Blocked client | Required CF | Reinforced | N/A |
| Settlement void | UI | enforceChecker | — | synthetic dual-control |

## Critical gaps before Production Read

1. Admin Next token verification not connected
2. Unmapped Legacy roles must stay deny
3. Rules drift across copies
4. Finance field conflicts (FC-*) can leak wrong numbers even to authorized users
5. Chargeback / gateway fee absence → incomplete financial truth

## Status

Documented only. No security rules modified.
