# Financial Fields Evidence

## Order money majors (SoT for trip economics)

| Field | Meaning (proven) | Writer | Confidence | Blocker? |
|---|---|---|---|---|
| `total` | Customer payable (base − discount) | CF `bookingFinancialMajorsFromQuote` | high | no |
| `total_mndob2` | Gross base fare | CF | high | no |
| `total_app` | Platform / company commission | CF | high | no |
| `total_vat` | Recorded VAT | CF | high | no |
| `total_mndob` | Driver net | CF (= base − app − vat) | high | no |
| `ksm` | Discount major | booking path | medium | maybe if missing |
| `currency` | Currency code | country / session | medium | yes if missing |
| `payment_status` | Payment state | CF / driver cash | high | no |
| `status_code` | Trip lifecycle | all apps | high | no |
| `PaymentMethod` / channel | cash vs online | booking | medium | no |
| `ALLNOW` | Online flag (legacy) | booking | medium | no |
| `ngeniusOrderId` / gateway ids | Gateway linkage | CF | high | no |
| `agent_id`, `agent_amount_minor`, … | FIN-9 snapshot | `syncAgentSnapshotOnOrderCreate` | medium (new) / low (old) | yes for old agent reports |
| `financial_snapshot` / V3 map | Prospective minor snapshot | financial_snapshot_v3 | medium / often absent | incomplete if relied on alone |
| `chargeback` | Boolean marker | UI projection reads | **low** | **YES** |

## Country rate fields

| Field | Collection | Usage | Confidence |
|---|---|---|---|
| `isvat` | countries | gates VAT in `verifiedBookingAmount` | high |
| `vat` | countries | VAT % of **baseFare** when isvat | high |
| `currency_code` / `Currency` | countries | quote currency | medium |
| `app_commission_percent` | user / countries | **AMBIGUOUS** — CF hardcodes 15% | **low** vs CF | **YES** |

## Agent commercial fields (`user`)

| Field | Meaning | Confidence |
|---|---|---|
| `Agent_total` | Agent commission % of platform fee | medium |
| `vat_percent` | Agent-facing VAT% display/config | medium |
| `app_commission_percent` | Stored on agent profile | low vs CF 15% |

## Wallet

| Field | Collection | Confidence | Notes |
|---|---|---|---|
| `currentBalance` | wallets | medium | scripts use this |
| `walletBalance` | wallets | medium | also written — **alias conflict** |
| transactions amount/type | transactions | medium | |

## Settlement

| Field/collection | Confidence |
|---|---|
| `financial_settlements.status` (draft/settled/voided/…) | high |
| direction DRIVER_PAYS_COMPANY / COMPANY_PAYS_DRIVER | high (labels) |
| nested lines/events | high |

## Misleading legacy names (CRITICAL documentation)

In `FinancialEngine.orderFinancials`:
- `repCommission` ≡ **Driver Net** (`total_mndob`) — name wrong
- `deliveryFees` ≡ **Gross Base Fare** (`total_mndob2`) — name wrong
- `appProfit` ≡ **Platform Fee** (`total_app`)

**CRITICAL LEGACY FINDING:** Do not map Admin Next concepts from V1 property names without adapters.
