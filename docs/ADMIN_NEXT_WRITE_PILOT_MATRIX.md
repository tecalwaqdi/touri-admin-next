# Admin Next — Write Pilot Readiness Matrix (P2)

**Mode:** readiness inventory only — **pilots NOT executed**.
**All Production gates default FALSE.**

| DOMAIN | GATE | SAFE FIXTURE AVAILABLE? | PILOT TRANSITION | EXPECTED WRITES | AUDIT | ROLLBACK | EXTERNAL DEPENDENCY |
|---|---|---|---|---|---|---|---|
| Driver review | `DRIVER_WRITE_ENABLED` ∧ GLOBAL ∧ PRODUCTION | YES (synthetic/approved fixture) | pending→needs_changes→approved / reject / suspend | `user/{id}` registration fields via controlled path / CF review bridge | INTENT+RESULT | reverse to prior legal state if SM allows | review CF if bridged |
| Driver create | `DRIVER_WRITE_ENABLED` | YES (offline Fake) | create persona driver doc | allowlisted create fields | INTENT+RESULT | archive/deactivate; no hard delete | none for Fake |
| Agent | `AGENT_WRITE_ENABLED` | YES | activate/deactivate/suspend | agent status + country invariant | INTENT+RESULT | deactivate; never auto-steal peers | ONE-COUNTRY-ONE-AGENT |
| Customer | customer write flags | YES | disable/block/reactivate | account state fields | INTENT+RESULT | reactivate | deletion remains website/CF |
| Geography | `GEOGRAPHY_WRITE_ENABLED` | YES | create/activate/deactivate/archive | countries/villages/mkan allowlisted | INTENT+RESULT | archive | no cascade delete |
| Regions | `REGION_WRITE_ENABLED` | YES | create/activate/deactivate | `cities` (region) docs | INTENT+RESULT | deactivate | hierarchy parents |
| Landmarks images | `GEOGRAPHY_WRITE_ENABLED` / `PARTNER_WRITE_ENABLED` | YES (Fake Storage) | replace/archive image | canonical Storage paths only | INTENT+RESULT | archive image | Production Storage WIF later |
| Vehicle Catalog | `VEHICLE_CATALOG_WRITE_ENABLED` | YES | create/update/deactivate | `type_car` | INTENT+RESULT | deactivate | free-text driver compat |
| Partner | `PARTNER_WRITE_ENABLED` | YES | activate/deactivate P1 fields | `mkan` where isShrek | INTENT+RESULT | deactivate | bookings portal N/A |
| Fleet | `FLEET_WRITE_ENABLED` | YES | activate/deactivate P1 fields | `transport_company` | INTENT+RESULT | deactivate | none |
| Guide | `GUIDE_WRITE_ENABLED` | YES | soft status | `user.is_tour_guide` | INTENT+RESULT | soft reverse | none |
| Support | `SUPPORT_WRITE_ENABLED` | YES | status/assign/note/resolve | `support` | INTENT+RESULT | reopen if SM allows | none |
| Notification | `NOTIFICATION_WRITE_ENABLED` | YES | mark-read / compose Fake | `admin_panel_notifications` | INTENT+RESULT | n/a mark-read | Fake push only |
| Finance periods | `FINANCE_WRITE_ENABLED` | YES | open/close/lock | `financial_periods` | INTENT+RESULT | reopen policy | FR controls |
| Finance settlements | `FINANCE_WRITE_ENABLED` + SoD | YES synthetic | submit/approve/reject/close/reverse + payments | V2 settlements/payments | INTENT+RESULT | reverse/void per SM | **pilot last** |
| Identity | `ADMIN_IDENTITY_WRITE_ENABLED` | YES Fake | persona role/scope | `user` allowlisted + CF claims | INTENT+RESULT | role downgrade policy | **WIF identity-admin SA** (`ADMIN_NEXT_IDENTITY_WIF_IAM_RUNBOOK.md`) |

**Hard rules**

- No pilot without synthetic/safe fixture
- No finance pilot before ops pilots
- No identity Production arm before WIF IAM proof
- No SA JSON / ADC / Owner / Editor
- Shadow-reader never writes
