# Legacy Inventory

**Mode:** Discovery only | **Legacy root:** `/Users/ventura/ara-ban` (single git root)  
**Firebase project id (from .firebaserc):** `tutorial-multi-language-70gx4j`

## Applications

| App | Path | Stack | Role |
|---|---|---|---|
| Legacy Admin | `admin/Admi` (pubspec `admin_arawatan`) | Flutter / FlutterFlow-style web | Panel ops, finance, agents, geo, drivers |
| Customer App | `admin/ara_oatan_app` | Flutter mobile | Bookings, payments, wallet top-up |
| Driver App | `admin/mndob-main` (pubspec `mndob`) | Flutter mobile | Accept/complete trips, cash confirm, wallet |
| Payment API | `admin/services/payment-api` | Next/Express TS Cloud Functions codebase | N-Genius create/finalize/refund/webhooks |
| Marketing site | `admin/touri-website` | Next.js | Public marketing — not trip SoT |
| Scripts | `admin/scripts` | Node admin scripts | Wallet credit, seed, geo fixes (ops tooling) |

## Firebase codebases (from firebase.json)

| Codebase | Source | Notes |
|---|---|---|
| `admin_functions` | `Admi/firebase/functions` | Claims, settlements V2, agent assignment, cash realization, finance callables |
| `admin_custom_functions` | `Admi/firebase/custom_cloud_functions` | `c33` only |
| `functions` (customer) | `ara_oatan_app/firebase/functions` | N-Genius, wallet ops, driver review, push |
| `custom_cloud_functions` (customer) | `ara_oatan_app/firebase/custom_cloud_functions` | autoCancelOrders, onChatCreated |
| `driver_functions` | `mndob-main/firebase/functions` | FCM + onUserDeleted (+ local driver_registration_v2.js present) |
| `payment-api` | `services/payment-api` | HTTP payment surface |

## Shared Firestore project

All inspected `.firebaserc` files default to **`tutorial-multi-language-70gx4j`**. Storage bucket: `tutorial-multi-language-70gx4j.firebasestorage.app`.

## Primary data sources

| Domain | Collection / path | Confidence |
|---|---|---|
| Trips / bookings | `order` | high |
| Users (customer/driver/agent/admin) | `user` | high |
| Geography | `countries`, `cities`, `villages`, `mkan` | high |
| Vehicles | `type_car` | high |
| Wallets | `wallets`, `transactions` | high |
| Settlements | `financial_settlements` (+ nested lines/events) | high |
| Agent country lock | `agent_country_assignment` | high |
| RTDB | **NOT FOUND** in app source (no FirebaseDatabase usage under admin apps) | high (absence) |

## Confidence legend

- **high** — proven by schema + write/read sites
- **medium** — proven by rules/indexes/UI with partial write evidence
- **low / unknown** — inferred or incomplete
