# TRIP_STATUS_SOURCE_PRIORITY

Evidence-only (not assumed examples). Sources:

- `docs/legacy-mapping/TRIP_STATUS_MAPPING.md`
- Dual-write fields documented from Legacy order writes (`halh_text`, `halh_order`, `halh`)
- Machine field: `order.status_code` (TourySystemStatusCodes)

| Rank | Source | Role | Confidence | Evidence | Notes |
|---|---|---|---|---|---|
| 1 | `status_code` | authoritative | high | TRIP_STATUS_MAPPING.md | Primary lifecycle SoT |
| 2 | `halh_order` | display_dual_write | medium | Halh enum / payment UX | Not independent lifecycle SoT |
| 3 | `halh_text` | display_dual_write | low | displayHalhForCode Arabic label | Display only |
| 4 | `halh` | legacy_fallback | low | OrderStatusHelper | Prefer status_code |

## Unknown / missing status_code

- Canonical status → `unmapped`
- Base trip record remains **displayable**
- `isSafeForOperationalAction=false`
- Never guess nearest status from Arabic labels alone

## Cancel / refund / dispute

- Cancel statuses (`cancelled_by_*`, `expired`) are lifecycle — mapped when `status_code` proven
- Refund / dispute amounts remain financial `DO_NOT_EXPOSE_YET` / incomplete unless separately proven (Phase 3.6)

## Code

`src/domain/trip/TripStatusSourcePriority.ts` + `legacyStatusContract.ts`
