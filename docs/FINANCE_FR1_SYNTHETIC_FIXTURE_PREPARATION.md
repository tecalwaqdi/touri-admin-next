# FINANCE FR1 SYNTHETIC FIXTURE PREPARATION

**Status:** PREPARED — fixture NOT created this session  
**REGISTRY_FIXTURE_DESIGN:** `PASS`  
**ORDER_TRIGGER_INSPECTION:** `NO-GO` (order/{id} create still forbidden)  
**GO for one registry fixture provisioning:** `GO` (not executed this session)  
**Production writes this session:** `0`  
**FINANCE_WRITE_ENABLED:** `false`  
**Settlement V2:** not invoked  
**FC-01:** APPROVED_15_PERCENT

## Decision boundary

Isolated registry fixture is APPROVED for controlled Finance pilot only.

Registry MUST NOT become: financial SoT, order replacement, real-trip fallback, third accounting book, UI-accessible accounting source, or general Production ingestion.

SoT remains: **order majors → Finance → Settlement V2 → payout/recon**.

## Step 1 — Trigger inspection

Legacy Cloud Functions (`ara-ban/admin/Admi/firebase/functions/index.js`):

| Trigger | Path | On order create | Class |
|---|---|---|---|
| `notifyAdminsOnNewBooking` | `order/{orderId}` onCreate | YES | **uncontrolled** — admin/agent FCM; optional `user` FCM-token cleanup writes; external Messaging API |
| `syncAgentSnapshotOnOrderCreate` | `order/{orderId}` onCreate | YES | **uncontrolled** — merge-writes agent snapshot; may attribute real SA agent |
| Settlement / cash / wallet callables | https.onCall | NO | none |
| Admin Next | — | NO order CF | none |

**Verdict:** `ORDER_TRIGGER_INSPECTION=NO-GO` — do not create Production `order/` docs; do not disable Production triggers.

## Step 2 — Safe fixture strategy (APPROVED)

**Isolated trigger-free registry** (no Legacy CF listeners found):

- Collection / document: `admin_next_finance_fr1_order_fixtures/test_adminnext_finance_fr1_completed_001`
- Stores exact legacy order payload for FR1 discovery bridge
- `order/{id}` materialization: **FORBIDDEN** while inspection is NO-GO
- Gate to consume as Finance input: **`FINANCE_FR1_REGISTRY_PILOT=1`**
- Maps registry → **SAME** `mapOrderToTripFinancialSnapshot` path used after order mapping (one calculation path)
- Normal Production Finance rejects registry input when pilot flag absent

## Exact fixture schema (legacy majors)

| Field | Value |
|---|---|
| `synthetic` / `financePilot` / `is_test` / `admin_next_finance_fixture` | `true` |
| `status_code` | `completed` |
| `currency` | `SAR` |
| `country_id` / `Rev_dolh` | `saudi_arabia` / `countries/saudi_arabia` |
| `total_mndob2` | `100` (gross **10000** minor) |
| `total` | `100` (eligible **10000** minor) |
| `total_app` | `15` (commission **1500** minor = FC-01 15%) |
| `total_vat` | `0` (persisted only; VatPolicy not approved — do not invent) |
| `total_mndob` | `85` (driver net **8500** minor) |
| `PaymentMethod` / `payment_method` / `payment_status` | `Cash` / `cash` / `cash_collected` |
| discount | omitted (not represented) |
| agent | `agent_attribution_status: none` + pre-seeded `agent_snapshot_at` (unknown_historical for FR1; no invented agent) |
| `driver_id` | synthetic string only — **no** `user` / Auth mutation |
| PII | none (label `SYNTHETIC_FINANCE_FR1_FIXTURE` only) |

Code: `src/application/finance/pilot/FinanceFr1SyntheticFixtureSchema.ts`

## Exact expected Production writes

| Mode | Total |
|---|---|
| This preparation session | **0** |
| Future armed **registry** create (idempotency + registry doc) | **2** (`admin_next_finance_fr1_order_fixtures:1`, `admin_next_cw_idempotency:1`; order/Settlement/Drivers/Agents/Customers/Auth/`finance_accounting_snapshots`: **0**) |
| Future FR1 live pilot using registry fixture | **4** (`finance_accounting_snapshots:1`, `finance_audit_events:2`, `admin_next_cw_idempotency:1`) |
| Rerun fixture exists / FR1 ALREADY_APPLIED | **0** |
| Direct `order/` create | **REFUSED** (uncontrolled) |

## IAM / ADC

- Required IAM (fixture provisioning): `datastore.entities.get`, `datastore.entities.create`
- Expected ADC principal: `info@touri-taxi.com`
- Project: `tutorial-multi-language-70gx4j`

## One-shot fixture provisioning command (SKIP default; NOT executed this session)

```bash
FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE=1 \
  FINANCE_WRITE_ENABLED=false \
  GLOBAL_PRODUCTION_WRITE_ENABLED=false \
  PRODUCTION_WRITE_ENABLED=false \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  TARGET=registry \
  DOCUMENT_ID=test_adminnext_finance_fr1_completed_001 \
  IDEMPOTENCY_KEY=finance_fr1_create_synthetic_completed_order_fixture_v1 \
  npx vitest run src/test/live/finance-fr1-synthetic-fixture.test.ts
```

## FR1 pilot command using registry fixture (NOT executed this session)

```bash
FINANCE_FR1_PILOT_APPLY=1 \
  FINANCE_FR1_REGISTRY_PILOT=1 \
  FINANCE_WRITE_ENABLED=true \
  GLOBAL_PRODUCTION_WRITE_ENABLED=false \
  PRODUCTION_WRITE_ENABLED=false \
  DRIVER_WRITE_ENABLED=false \
  AGENT_WRITE_ENABLED=false \
  CUSTOMER_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
  SOURCE=registry \
  FIREBASE_ID_TOKEN='…' \
  npx vitest run src/test/live/finance-fr1-pilot-apply.test.ts
```

## RO verification (SKIP default)

```bash
FINANCE_FR1_REGISTRY_FIXTURE_VERIFY=1 \
  FINANCE_FR1_REGISTRY_PILOT=1 \
  FINANCE_WRITE_ENABLED=false \
  EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
  npx vitest run src/test/live/finance-fr1-registry-fixture-verify.test.ts
```

## Proof: normal Production cannot consume registry

- `assertProductionFinanceRejectsRegistryInput` / `mapOrderToTripFinancialSnapshot` throw `FINANCE_FR1_REGISTRY_PILOT_DENIED` when `sourceCollection=admin_next_finance_fr1_order_fixtures` (or `sourceKind=registry_fixture`) and `FINANCE_FR1_REGISTRY_PILOT≠1`
- FR1 live arm with `SOURCE=registry` blocked unless `FINANCE_FR1_REGISTRY_PILOT=1`
- Unit coverage: `src/test/unit/finance-fr1-synthetic-fixture-preparation.test.ts`

## Cleanup strategy

- Order delete: N/A (order not created)
- Registry: delete only if unused (no FR1 snapshot keyed by order id); else **permanent clearly-marked synthetic**
- No Settlement V2 cleanup

```bash
unset FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE TARGET IDEMPOTENCY_KEY DOCUMENT_ID && \
  export FINANCE_WRITE_ENABLED=false && \
  export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false && \
  export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false
# Manual Firestore delete ONLY if unused (no finance_accounting_snapshots/test_adminnext_finance_fr1_completed_001):
#   admin_next_finance_fr1_order_fixtures/test_adminnext_finance_fr1_completed_001
#   admin_next_cw_idempotency/finance_fr1_create_synthetic_completed_order_fixture_v1
```

## Real create path (implemented; live NOT executed this session)

When `FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE=1` + `TARGET=registry` + all gates + IAM/ADC:

1. Existence probe (create-only; never overwrite)
2. Consistent both → `FIXTURE_ALREADY_EXISTS` / 0 writes
3. Partial/conflict → `CONFLICT_NO_GO` / 0 writes (never auto-repair)
4. Else create registry + idempotency (exactly 2), post-write verify
5. Success → `FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS`
6. Summary → `.local/finance-fr1-pilot/fixture-provision-safe-summary.json`

## GO/NO-GO

| Item | Verdict |
|---|---|
| REGISTRY_FIXTURE_DESIGN | **PASS** |
| Real create path implementation | **PASS** |
| One registry fixture provisioning | **GO** (ready; not executed this session) |
| This session Production writes | **0** |
| FR1 live apply this session | **NO-GO / not executed** |
