# Driver Status Mapping

**CRITICAL LEGACY FINDING (documented, not fixed):** Five orthogonal axes must never collapse.

Source: `Admi/lib/core/admin_driver_status_truth.dart` + tests `admin_drivers_status_truth_test.dart`.

## Axes

| Axis | Fields | Values | Confidence |
|---|---|---|---|
| Registration | `registration_status` (fallback `submission_status`), `registration_flow_version` | pending_review, draft, needs_changes, approved, rejected, … | high |
| Account activation | `actev_mndob`, optional `account_status` | active/inactive | high |
| Connection (online) | `is_online`, `ngl`, `operational_status` | online/offline/unknown | medium |
| Availability | derived from account + online + onTrip | available/busy/unavailable | medium |
| Active trip | `mndon_newacc`, ops `on_trip`/`busy` | boolean | medium |
| Auth disabled | Firebase Auth disabled vs Firestore | mismatch flag | medium |

## Proven rules

1. `pending_review` + `actev_mndob=true` ≠ approved (test asserts).
2. Operational activate/deactivate patches must not rewrite `registration_status`.
3. Offline GPS freshness must not imply Online.

## Persona flags on `user`

| Flag | Meaning |
|---|---|
| `ismndob` | Driver persona |
| `actev_mndob` | Driver account activated |
| `actev_user` | User account active |
| `Isagent` | Agent persona |

## Data source

Drivers live in **`user`** collection (not a separate `drivers` collection). Confidence: **high**.
