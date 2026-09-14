# Finance Implementation Design

**Status:** Design locked for **OFFLINE** implementation preparation only.  
**Date:** 2026-09-13  
**Prerequisite:** `docs/FINANCE_ARCHITECTURE_INSPECTION.md` (CLOSED).  
**Hard locks:** `FINANCE_WRITE_ENABLED=false`; no Production mutation; no CF deploy; no historical rewrite; no Drivers/Agents/Customers rollout changes.

---

## 0. Verdict (one sentence)

**Authoritative path:** persisted order majors → Settlement V2 accounting lines → `financial_settlements` + payments/controls → reconciliation; Admin Next UI/synthetic is display/lab only until an adapter maps onto that path.

**GO** for offline Finance domain/contracts/Fake/tests.  
**NO-GO** for Production Finance writes, CF deploy, or `FINANCE_WRITE_ENABLED`.

---

## 1. Authoritative financial flow (REQ-1)

```
completed trip (order majors SoT)
        ↓  (read / analyze — no invent)
accounting entry (Settlement V2 lines via financial_accounting_v2 contract)
        ↓  (eligible lines only)
settlement cycle (financial_settlements draft → lock → payments)
        ↓
payout / remittance confirm
        ↓
reconciliation run (order ↔ ledger lines ↔ settlement ↔ provider ↔ refunds/chargebacks)
```

| Layer | SoT | Non-SoT |
|---|---|---|
| Trip economics | Order majors (`total_mndob2`, `total`, `total_app`, `total_vat`, `total_mndob`, payment_status, agent snapshot when present) | Any recalculation from today’s rates |
| Operational books | Settlement V2 (`financial_accounting_v2` lines → `financial_settlements` + payments + `finance_controls` + `driver_ledger`) | Admin Next synthetic settlement/CoA journal |
| Classic CoA GL | **Out of scope** — do not invent a third books system | `SYN-*` ChartOfAccounts |

**Decision D-01:** Do **not** create a third competing accounting source. Production adapter reuses V2; synthetic Phase 2 remains `productionApproved=false`.

---

## 2. Business coverage map (REQ-2)

| Concept | Decision | Source |
|---|---|---|
| Cash | Driver holds; company exposure = cashHeld − driverNet; remittance via settlement payment `DRIVER_PAYS_COMPANY` | V2 + cash flow legacy |
| Card/online | Company holds; driver payable via online remain; `COMPANY_PAYS_DRIVER` | V2 + online payment trace |
| Commission (platform) | Historical **amount** = `total_app`; **rate** not auto-approved (15% = legacy evidence only) | FP-01/04 |
| VAT | Historical **amount** = `total_vat`; no current-country re-rate | FP-09 |
| Driver gross | `total_mndob2` | Canonical freeze |
| Driver deductions | Provenance-derived `total_app + total_vat` when both present; else incomplete | Class B |
| Driver net | Persisted `total_mndob` wins; derived only with provenance; not settlement-eligible if derived unless policy approved | **D-FC-02** below |
| Agent share | % of platform fee; snapshot amount only; never invent from current country agent | FP-07 |
| Company gross/net | Company share of platform fee after agent slice + VAT position per V2 lines | V2 lines |
| Refunds | Read `payment_sessions` / refunded status; do not invent order-major rewrite | Session SoT |
| Chargebacks | `not_represented` until ChargebackPolicy + gateway handler approved; amount **null never 0** | FP-11 |
| Adjustments | Explicit adjustment/reversal docs via finance_controls pattern; never mutate historical majors | Append-only |
| Payouts | Settlement payments (pending→confirmed→reversed) | V2 payments |
| Settlement cycles | Period-scoped settlements; period lock via `finance_periods` | V2 |
| Reconciliation | Dedicated run artifact comparing dimensions in §10 | New offline domain first |
| Invoices | **Deferred:** invoice = settlement statement export of locked/settled settlement; no separate invoice ledger in v1 | D-02 |
| Audit trail | Append-only events on settlement + finance_audit_events | §14 |

---

## 3. Missing ≠ zero; persisted majors win (REQ-3)

**Decision D-03:**

1. Every money field carries `availabilityStatus`: `available | missing | unknown | not_represented | incomplete`.
2. Missing/unknown/not_represented → `value=null` + warning reason — **never coerce to 0**.
3. Settlement eligibility requires majors present + completed + collected confidence (V2 `analyzeOrder` contract).
4. If both persisted major and a derived recalculation exist → **persisted wins**. Derived may be shown with `provenance=derived` for diagnostics only.
5. Incomplete trip → accounting line `eligible=false` with exclusion reason; never silent zero fill.

---

## 4. Immutability (REQ-4)

**Decision D-04:**

| Artifact | Mutability |
|---|---|
| Order majors after complete | Immutable |
| Locked settlement lines/claims | Immutable |
| Confirmed settlement payment | Immutable; reverse via new reverse payment |
| Settled settlement | No in-place edit; void only if V2 rules allow pre-settle; post-settle correction = adjustment + optional reverse settlement |
| Adjustments | New signed docs only |
| Agent/country commission rates today | Must not rewrite historical trip attribution |

---

## 5. Append-only ledger + idempotency (REQ-5)

**Decision D-05:**

- **Operational ledger** = Settlement V2 events + payments + finance_controls adjustments + `driver_ledger` entries. Not a classic CoA.
- Optional Admin Next projection: `finance_ledger_entries` (Fake/offline first) mirroring V2 events for reports — **projection, not second books**.
- Idempotency key format (deterministic):

```
{actorUid}|{op}|{resourceType}|{resourceId}|{clientKey}
```

Ops: `settlement.create | settlement.lock | settlement.void | payment.create | payment.confirm | payment.reverse | adjustment.create | adjustment.approve | recon.run`.

- Completed idempotency doc returns prior result (V2 proven pattern).
- Duplicate create with same key ≠ second settlement.

---

## 6. Money / currency (REQ-6)

**Decision D-06:**

| Rule | Value |
|---|---|
| Storage | Integer **minor units** (`amountMinor: bigint` / number in Firestore) |
| Domain type | Existing `Money` class — no float arithmetic |
| Currency | ISO code on every money + settlement; mismatch → hard error |
| Rounding | Half-up on percent/bps in minor units (synthetic path already); historical amounts not re-rounded |
| Multi-currency | One settlement = one currency; unsupported currency → exclude from settlement (V2) |
| Display | UI formats backend minors only |

---

## 7. Calculation pipeline order (REQ-7)

**Decision D-07 — exact order for NEW / synthetic projection only:**

1. Gross fare (base)  
2. Discounts → customer payable  
3. Eligibility gates (completed, payment proven, majors present, not disputed)  
4. Platform commission **amount** (from approved policy for *new* trips only; never invent for history)  
5. VAT amount (from approved VatPolicy for *new* trips; history = `total_vat`)  
6. Driver net = gross − platform − VAT (**observed** legacy; DiscountTreatmentPolicy may change *future* only)  
7. Agent share = % of platform fee (country-active agent at quote → snapshot)  
8. Company net of platform = platform − agent  
9. Settlement positions (cash/online signed exposure)  
10. Settlement header aggregates eligible lines only  

**Historical path:** skip steps 4–6 recalculation; **load persisted majors** in that conceptual order for display/settlement eligibility.

**Decision D-FC-01 (closes inspection FC-01 for design):**  
15% CF hardcode = `proven_legacy_behavior` only. **Not** Production policy. Future rate requires `FinancialPolicy.status=approved` AND `productionApproved=true` (human). Offline code may use draft policy for Fake trips; must assert non-production.

**Decision D-FC-02 (closes FC-02):**  
Settlement-eligible driver net = persisted `total_mndob` when valid. If missing → incomplete, not eligible. Derived `base−app−vat` allowed for diagnostics with provenance; **not** used to lock settlement amounts until DiscountTreatmentPolicy is approved. Observed: discount does not reduce `total_mndob`.

---

## 8. Agent attribution (REQ-8)

**Decision D-08:**

- **ONE COUNTRY = ONE ACTIVE AGENT** for *new* quote attribution (existing country lock).
- Historical: use order snapshot (`agent_id`, `agent_rate`, `agent_amount_minor`, `agent_rate_type=percent_of_platform_fee`) when present.
- Missing snapshot → `agentAttributionStatus=unknown_historical`; **never** attribute to currently active country agent.
- Agent amount does **not** reduce driver net / VAT / gross.
- Agent settlement eligibility requires snapshot amount; else exclude.

---

## 9. Settlement model (REQ-9)

### 9.1 Reuse V2 (REQ-15)

**Decision D-09:** Production settlement **is** Legacy Settlement V2. Admin Next production adapter must speak V2 statuses and payment model. Synthetic SM (`draft/under_review/approved/closed/reversed`) remains lab-only.

### 9.2 Production status vocabulary (adopt V2)

```
draft → locked → partially_paid → settled
              ↘ voided
payments: pending → confirmed | reversed
```

| V2 status | Meaning | Admin Next synthetic map (display-only) |
|---|---|---|
| draft | Editable preview | draft / under_review |
| locked | Dual-control approved; claims frozen | approved |
| partially_paid | Some confirmed payments | approved (open payout) |
| settled | Outstanding zero | closed |
| voided | Released claims | reversed (pre-settle) |

Post-settle correction = reverse payment(s) + adjustment; optional new reversing settlement — not in-place edit.

### 9.3 Parties

| Model | Decision |
|---|---|
| Driver ↔ Company | **Primary** — reuse V2 as-is (`DRIVER_PAYS_COMPANY` / `COMPANY_PAYS_DRIVER`) |
| Agent ↔ Company | **Same collection**, required `partyType: "driver" \| "agent"` + `partyId`. Agent settlements claim **agent commission lines only** — never driver cash/online positions. **D-FC-08:** product must still approve going live; offline implements Fake now |
| Cash | Outside company until remitted; driver owes company on cash trips |
| Card | To company; company owes driver net |

### 9.4 Due / collect / pay positions

| Position | Definition |
|---|---|
| due | Absolute settlement amount from locked eligible lines + opening/adjustments |
| collect | Confirmed inbound payments (driver→company) |
| pay | Confirmed outbound payments (company→driver/agent) |
| outstanding | due − confirmed (signed per direction) |

### 9.5 Lifecycle labels for ops UX

| Ops label | Maps to |
|---|---|
| open | draft \| locked with outstanding > 0 and no overdue rule |
| paid | settled |
| partial | partially_paid |
| overdue | locked/partially_paid past `dueAtUtc` (new field on adapter; optional) |
| reversed | voided **or** settlement with full payment reversals + adjustment link |

### 9.6 Dual control

- Create/refresh draft: `settlements:create` (accountant)
- Lock (= approve): `settlements:approve` (finance_approver ≠ creator)
- Execute payments: `settlements:execute` (**new** permission — separate from approve)
- Void / reverse payment / reverse settlement: `settlements:reverse` (**new**)
- Adjustments: `finance:adjust` create + `finance:adjust_approve` (≠ creator)

---

## 10. Reconciliation model (REQ-10)

**Decision D-10:** Reconciliation is a **read/compare command**, not a second ledger.

`ReconciliationRun` compares for a period/country/currency:

1. Order majors (completed, eligible candidates)  
2. Accounting lines (V2 analyze / projected lines)  
3. Settlement claims/lines locked amounts  
4. Settlement payments confirmed  
5. Provider sessions (capture/refund) when present  
6. Payouts (confirmed settlement payments)  
7. Refunds (sessions)  
8. Chargebacks (null/not_represented until policy)  

Each variance row: `{ dimension, leftRef, rightRef, leftMinor, rightMinor, deltaMinor, severity, reasonCode }`.  
Never auto-fix Production. Offline Fake can assert expected variances.

Severity: `info | warning | blocker`. Blocker variances prevent settlement lock in future write phase.

---

## 11. Reports (REQ-11)

**Decision D-11:** Reports read backend aggregates only (UI non-authoritative).

**Dimensions:** country, city, agent, driver, currency, payment channel (cash/card), period, settlement status, trip status, attribution status.

**Metrics (null-safe):** gross fare, customer total, discount, platform commission, VAT, driver gross/net/deductions, agent share, company net, cash collected, online collected, refunds, chargebacks (nullable), adjustments, settlement due/paid/outstanding, payout totals, incomplete trip count, recon variance count.

Incomplete metrics → `null` + `incompleteReasons[]`, never zero-fill.

---

## 12. RBAC (REQ-12)

Extend existing RBAC (`docs/RBAC.md`) — **do not collapse** view/approve/execute.

| Permission | Purpose |
|---|---|
| `finance:read` | View finance hubs, trip financial read models, settlements list |
| `settlements:create` | Draft / refresh |
| `settlements:approve` | Lock (dual control) |
| `settlements:execute` | Create/confirm payout payments |
| `settlements:reverse` | Void settlement / reverse payment |
| `finance:adjust` | Create adjustment draft |
| `finance:adjust_approve` | Approve adjustment |
| `reports:export` | Export reports/statements |
| `audit:read` | Financial audit trail |

| Role | Grants (finance-relevant) |
|---|---|
| accountant | finance:read, settlements:create, finance:adjust, reports:export (scoped) |
| finance_approver | finance:read, settlements:approve, finance:adjust_approve |
| operations_manager | finance:read; settlements:execute (optional scoped) — **not** approve by default |
| super_admin | all (still subject to FINANCE_WRITE_ENABLED) |
| reporting_viewer | finance:read, reports:export (aggregate only) |
| auditor | finance:read, audit:read |
| support_agent | **none** finance write; no settlements:* |
| country_admin / agent_user | no finance write; limited read only if product later scopes — default **deny** finance until explicit |

Creator ≠ approver enforced in domain + API.

---

## 13. UI non-authoritative (REQ-13)

**Decision D-13:**

- UI never computes commission/VAT/driver net for Production display.
- UI binds to API DTOs produced by FinanceApplicationService / Settlement V2 adapter.
- Synthetic `/finance` `/settlements` pages keep `synthetic: true` badge and `productionApproved=false` until adapter cutover.
- Any client-side math is display formatting of minors only.

---

## 14. Schema, domain, services (REQ-14)

### 14.1 Collections / tables (Production reuse + offline Fake)

| Collection | Action |
|---|---|
| `order` | **Read** majors only |
| `financial_settlements` | **Reuse** — add required `partyType`, keep V2 statuses |
| nested lines / claims / events | **Reuse** |
| settlement payments | **Reuse** |
| idempotency docs | **Reuse** pattern |
| `finance_periods` | **Reuse** |
| finance_controls adjustments / opening balance | **Reuse** |
| `driver_ledger` | **Reuse** for driver exposure |
| `payment_sessions` | **Read** refunds |
| `finance_reconciliation_runs` | **New** (offline Fake first; Production later) |
| `finance_audit_events` | **New** append-only (or map to periods().writeAudit) |
| `finance_ledger_entries` | **Optional projection** of V2 events — not SoT |
| Synthetic CoA / journals | Lab only |

### 14.2 TS domain modules (offline first)

```
domain/finance/v2/
  TripFinancialSnapshot.ts      # majors + availability
  AccountingLine.ts             # V2 line contract
  CalculationPipeline.ts        # D-07 order; historical vs new
  AgentAttribution.ts           # D-08
domain/settlement/v2/
  SettlementV2.ts               # V2 statuses + partyType
  SettlementV2StateMachine.ts
  SettlementPayment.ts
  SettlementDirections.ts
domain/reconciliation/
  ReconciliationRun.ts
  Variance.ts
application/finance/
  FinanceReadService.ts         # UI DTOs from snapshots
  SettlementCommandService.ts   # gated; Fake offline
  AdjustmentCommandService.ts
  ReconciliationService.ts
  FinanceAuditService.ts
repositories/interfaces/
  SettlementV2Repository.ts
  AccountingLineRepository.ts
  ReconciliationRepository.ts
  FinanceAuditRepository.ts
repositories/fake/
  FakeSettlementV2Repository.ts
  ...
```

Existing Phase 2 synthetic types stay; mark clearly `Synthetic*` and do not feed Production adapter.

### 14.3 Commands (idempotent)

| Command | Idempotency op | Gate |
|---|---|---|
| CreateSettlementDraft | settlement.create | settlements:create + period open |
| RefreshSettlementDraft | settlement.refresh | settlements:create |
| LockSettlement | settlement.lock | settlements:approve + ≠ creator |
| CreateSettlementPayment | payment.create | settlements:execute |
| ConfirmSettlementPayment | payment.confirm | settlements:execute |
| ReverseSettlementPayment | payment.reverse | settlements:reverse |
| VoidSettlement | settlement.void | settlements:reverse |
| CreateAdjustment | adjustment.create | finance:adjust |
| ApproveAdjustment | adjustment.approve | finance:adjust_approve |
| RunReconciliation | recon.run | finance:read (write run doc later) |

All commands check `FINANCE_WRITE_ENABLED` — offline Fake uses `FinanceWriteGate` that is **always deny for Production env**.

### 14.4 State machines

- Settlement: §9.2  
- Payment: pending → confirmed | reversed  
- Adjustment: draft → approved | rejected; approved emits ledger delta  
- Reconciliation run: created → completed | failed  

### 14.5 Audit schema

```ts
FinanceAuditEvent = {
  id, atUtc, actorUserId, action, resourceType, resourceId,
  correlationId, idempotencyKey?,
  before?: unknown, after?: unknown,
  reason?: string, countryId?, currency?,
}
```

Append-only; no update/delete API.

### 14.6 Migration strategy (REQ-16)

**Decision D-16:**

1. **No blind historical rewrite** of orders or settled V2 docs.  
2. Phase F2: Production **read adapter** maps order majors + existing settlements into Admin Next DTOs.  
3. Missing agent snapshots stay `unknown_historical`.  
4. Optional additive fields only (`partyType` default `"driver"` on read if absent).  
5. Shadow recon (F3) compares Admin Next projection vs V2 without writes.  
6. Write cutover only after human GO + feature flag + period freeze rehearsal.  
7. Rollback = disable flag; leave V2 Legacy CF as operational SoT.

---

## 15. Closed inspection conflicts

| ID | Design decision |
|---|---|
| FC-01 | APPROVED 15% versioned; amount historical = `total_app`; no scatter hardcode 15; fail closed `FINANCE_POLICY_UNRESOLVED_FC01` if unbound |
| FC-02 | APPROVED: persist gross; discount separate; funding owner required; settlement net = persisted `total_mndob` |
| FC-03 | APPROVED: snapshot/unknown attribution; one-active-agent; agent settlement exposures separate |
| FC-04 | APPROVED: chargeback append-only; disputed→suspense; fees separate |
| FC-05 | APPROVED: gateway fee independent; default Company owner |
| FC-09 | Single path: order majors + V2; synthetic not Production |
| SM labels | Production = V2 vocabulary; synthetic map display-only |
| Agent party | Same collection + `partyType=agent`; FC-03 approved; Production write GO separate |
| Gateway fee | FC-05 approved independent component |

---

## 16. Implementation phases

| Phase | Scope | Writes | Exit |
|---|---|---|---|
| **F0** | This design doc | none | Design accepted |
| **F1** | Offline domain contracts + Fake repos + contract tests | Fake only | Tests green; FINANCE_WRITE_ENABLED still false |
| **F2** | Production **read** adapter (order majors + V2 settlements) | none | Shadow DTOs match fixtures |
| **F3** | Reconciliation offline + shadow variance reports | recon Fake / read-only runs | Variance taxonomy stable |
| **F4** | Agent party Fake settlement + attribution tests | Fake only | D-08 locked in tests |
| **F5** | Command services + write gate + RBAC permission wiring (still disabled) | none in Production | Gate denies all Production |
| **F6** | Policy lock FC-01..05 APPROVED (FC-01 = 15% versioned); write GO separate | none | Registry locked — see `docs/FINANCE_CONTROLLED_ROLLOUT_PREPARATION.md` |
| **FR1–FR7** | Controlled Finance Rollout **offline prep** (harness SKIP) | Fake only | Prep PREPARED |
| **F7 / FR1 pilot** | Controlled write pilot (separate GO) | flagged only | Explicit Production Finance GO + synthetic candidate — see `docs/FINANCE_FR1_PILOT_PREPARATION.md` |

**Do not start Production Finance pilot until synthetic candidate + write GO + armed harness.**

---

## 17. Offline test scenarios (REQ-17)

Contract tests (Fake) must cover:

1. Completed cash trip → majors → eligible line → draft → lock → payment confirm → settled  
2. Card trip → company holds → COMPANY_PAYS_DRIVER payout  
3. Missing major → incomplete; not eligible; null not zero  
4. Persisted driver net wins over derived  
5. Historical VAT/commission not re-rated  
6. Agent snapshot attribution; missing → unknown_historical  
7. One country one active agent on *new* Fake quote path  
8. Idempotent lock/payment  
9. Dual control: creator cannot lock  
10. Adjustment append-only (no major mutate)  
11. Refund session read; order majors unchanged  
12. Chargeback amount null / not_represented  
13. Recon variance when line ≠ settlement claim  
14. RBAC deny execute without `settlements:execute`  
15. FINANCE_WRITE_ENABLED false → Production gate deny  

Synthetic Phase 2 tests remain separate and must not claim Production SoT.

---

## 18. Explicit non-goals (this preparation)

- Enable `FINANCE_WRITE_ENABLED`  
- Deploy Cloud Functions / migrate Production  
- Rewrite historical orders  
- Replace Settlement V2 with synthetic SM  
- Invent classic CoA as Production books  
- Approve 15% or any rate without human FP registry update  
- Touch Drivers/Agents/Customers controlled-write rollouts  

---

## 19. GO / NO-GO

| Track | Decision |
|---|---|
| Offline Finance implementation (F1–F5 design code/Fake/tests) | **GO** |
| Production Finance reads adapter (F2) | **GO** after F1 contracts land (read-only) |
| F6 policy closure (FC-01..05) | **PASS** (FC-01 = APPROVED 15% versioned) |
| Controlled Finance Rollout offline prep (FR1–FR7) | **PREPARED** |
| Production Finance writes / CF / flag enable / first pilot | **NO-GO** until synthetic FR1 candidate + armed `FINANCE_FR1_PILOT_APPLY` session — see `docs/FINANCE_FR1_PILOT_PREPARATION.md` |
| Third accounting system | **NO-GO** |
