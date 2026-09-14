# Legacy Event Flow

```text
[Customer App]
  │ createCashBooking / createNGeniusPayment
  ▼
[payment_sessions] ──webhook──► [ngeniusWebhook]
  │ finalizeNGeniusBooking / createCashBooking
  ▼
[order] status_code=pending_driver
  │
  ├─ onCreate → syncAgentSnapshotOnOrderCreate (agent_* fields)
  ├─ onCreate → notifyAdminsOnNewBooking
  │
  ▼
[Driver] acceptDriverOrder (cash) / client accept (non-cash fallback)
  → status_code=driver_assigned
  → arriving → arrived → trip_in_progress → completed
  │
  ├─ cash: payment_status pending_cash → cash_collected (confirmCashCollectionV2)
  ├─ online: payment_status paid (already)
  │
  ▼
[Finance Admin]
  aggregateFinancialAccountingV2 / settlements V2 / periods / adjustments
  wallets ← adminAdjustDriverWallet / payCompanyFromWallet

[autoCancelOrders] pending_driver stale → expired

[Auth] user write → syncUserClaimsOnWrite → custom claims
```

## Notifications

- FCM tokens subcollection + ff_user_push_notifications triggers
- Admin panel notifications collection
- Driver registration notification docs
- WhatsApp via secureIntegrations (customer CF)

## Confidence

Graph structure: **high** for booking→accept→complete→cash. Settlement subgraph: **high** for callable names, **medium** for exact state machine without live docs.
