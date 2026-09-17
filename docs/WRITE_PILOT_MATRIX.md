# Admin Next — Write Pilot Readiness Matrix

**Mode:** readiness inventory only — **pilots NOT executed**.
**All Production gates default FALSE.**
**Production adapters:** ALL legitimate domains **REAL** (see `ADMIN_NEXT_FINAL_WRITE_MATRIX.md`). Gate disabled OK; Fake/Stub/Memory/Disabled adapters for Production runtime = **ZERO**.

| DOMAIN | GATE | ADAPTER | SAFE FIXTURE AVAILABLE? | PILOT TRANSITION | EXPECTED WRITES | AUDIT | ROLLBACK | EXTERNAL DEPENDENCY |
|---|---|---|---|---|---|---|---|---|
| Driver review | `DRIVER_WRITE_ENABLED` ∧ GLOBAL ∧ PRODUCTION | REAL | YES (synthetic pending_review via CF path) | pending→needs_changes→approved / reject / suspend | CF `reviewDriverApplicationV2` + allowlisted `user` | INTENT+RESULT | reverse legal SM only | driver-review WIF SA |
| Agent | `AGENT_WRITE_ENABLED` | REAL | YES | activate/deactivate/suspend | agent status + country invariant | INTENT+RESULT | deactivate | ops-writer WIF; ONE-COUNTRY-ONE-AGENT |
| Customer | customer write flags | REAL | YES | disable/block/reactivate | account state fields | INTENT+RESULT | reactivate | ops-writer; deletion = website/CF |
| Geography | `GEOGRAPHY_WRITE_ENABLED` | REAL | YES | create/activate/deactivate/archive | countries/villages/mkan | INTENT+RESULT | archive | ops-writer; no cascade delete |
| Regions | `REGION_WRITE_ENABLED` | REAL | YES | create/activate/deactivate | `cities` (region) | INTENT+RESULT | deactivate | hierarchy parents |
| Vehicle Catalog | `VEHICLE_CATALOG_WRITE_ENABLED` | REAL | YES | create/update/deactivate | `type_car` | INTENT+RESULT | deactivate | ops-writer |
| Partner | `PARTNER_WRITE_ENABLED` | REAL | YES | activate/deactivate | `mkan` isShrek | INTENT+RESULT | deactivate | ops-writer |
| Fleet | `FLEET_WRITE_ENABLED` | REAL | YES | activate/deactivate | `transport_company` | INTENT+RESULT | deactivate | ops-writer |
| Guide | `GUIDE_WRITE_ENABLED` | REAL | YES | soft status | `user.is_tour_guide` | INTENT+RESULT | soft reverse | ops-writer |
| Support | `SUPPORT_WRITE_ENABLED` | REAL | YES | status/assign/note/resolve | `support` | INTENT+RESULT | reopen if SM allows | ops-writer |
| Notification | `NOTIFICATION_WRITE_ENABLED` | REAL | YES | mark-read / compose panel | `admin_panel_notifications` | INTENT+RESULT | n/a mark-read | ops-writer; **no client FCM tokens** |
| Finance | `FINANCE_WRITE_ENABLED` + SoD | REAL | YES synthetic | FR1–FR7 Settlement V2 | V2 settlements/payments/periods | INTENT+RESULT | reverse/void per SM | finance-writer WIF; **pilot last** |
| Identity | `ADMIN_IDENTITY_WRITE_ENABLED` | REAL | YES | persona role/scope | `user` allowlisted + CF claims | INTENT+RESULT | role downgrade | **identity-admin WIF** runbook |

**Hard rules**

- No pilot without synthetic/safe fixture
- No finance pilot before ops pilots
- No identity Production arm before WIF IAM proof
- No SA JSON / ADC / Owner / Editor
- Shadow-reader never writes
- ZERO FAKE/STUB/MEMORY/DISABLED_ADAPTER on Production runtime for rows above

Also published as `docs/ADMIN_NEXT_WRITE_PILOT_MATRIX.md` (same content authority).
