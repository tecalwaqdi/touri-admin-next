# Cloud Functions Inventory

## Admin — `admin_functions` (`Admi/firebase/functions/index.js`)

### Auth / panel
| Export | Type | Purpose |
|---|---|---|
| syncUserClaimsOnWrite | Firestore onWrite user | Derive custom claims |
| refreshMyClaims | callable | Refresh claims |
| createPanelUser | callable | Create panel user (+ agent lock) |
| onUserDeleted | Auth onDelete | Cleanup |

### Agents
| Export | Type |
|---|---|
| assignActiveCountryAgent / reassignActiveCountryAgent / deactivateCountryAgent / updateCountryAgentAssignment | callable |
| syncAgentSnapshotOnOrderCreate | Firestore onCreate order |

### Finance / settlements
| Export | Type |
|---|---|
| aggregateFinancialSummary | callable |
| aggregateFinancialAccountingV2 | callable |
| createSettlementDraftV2 / refreshSettlementDraftV2 / lockSettlementV2 / markSettlementSettledV2 / voidSettlementV2 | callable |
| allocateLegacyPaymentV2 / createSettlementPaymentV2 / confirmSettlementPaymentV2 / reverseSettlementPaymentV2 / allocateExistingPaymentV2 | callable |
| aggregateSettlementExposureV2 / verifySettlementSourceV2 | callable |
| createFinancialPeriodV2 / close / reopen / periodCloseChecklistV2 | callable |
| scanFinancialExceptionsV2 / listIncompleteOrdersV2 / detectFinanceOrphansV2 | callable |
| createAdjustmentDraftV2 / approveAdjustmentV2 / reverseAdjustmentV2 / createOpeningBalanceV2 | callable |
| loadDriverStatementV2 / aggregateCompanyPositionV2 / periodDashboardV2 / accountantHomeV2 | callable |
| searchFinanceAuditV2 / financialReportV2 / financeApprovalPolicyV2 / requestExistingPaymentAllocationV2 | callable |
| getDriverFinancialSummaryV2 | callable |
| confirmCashCollectionV2 / adminConfirmCashCollectionV2 | callable |
| adminAdjustDriverWallet | callable |
| recordAuditLog | callable |

### Drivers / email
| Export | Type |
|---|---|
| submitDriverApplicationV2 / reviewDriverApplicationV2 | callable |
| requestEmailVerificationOtp / verifyEmailVerificationOtp | callable |
| notifyAdminsOnNewBooking | Firestore trigger |
| geminiGenerateText | callable |

### Admin custom
| Export | Type |
|---|---|
| c33 | custom_cloud_functions |

## Customer — `ara_oatan_app/firebase/functions`

| Export | Purpose |
|---|---|
| createNGeniusPayment / getNGeniusPayment / finalizeNGeniusBooking / createCashBooking | Booking payments |
| normalizeCashBookingCompatibility | Compat |
| finalizeNGeniusWalletTopUp / createWalletWithdrawalRequest / finalizeNGeniusExtraHours | Wallet / extras |
| refundNGeniusPayment / ngeniusWebhook | Refunds / webhooks |
| sendWhatsAppMessage / reverseGeocode / getRoadRoute / waslRequest | Integrations |
| approve/reject/requestDriverChanges / autoActivateDriver | Driver registration |
| submit/reviewDriverApplicationV2 / reviewDriverDocument | Driver V2 |
| adminEnsureDriverCountryConfigs / onCountryCreatedDriverConfig | Country driver config |
| scanDriverDocumentExpiry | scheduled/notify |
| email OTP trio + probeBrevo | OTP |
| acceptDriverOrder / payCompanyFromWallet | Wallet ops |
| addFcmToken / sendPush*Trigger | Push |
| onUserDeleted | Auth cleanup |

### Customer custom
| Export | Purpose |
|---|---|
| autoCancelOrders | Expire stale pending |
| onChatCreated | Chat |
| newCloudFunction | placeholder-ish |

## Driver — `mndob-main/firebase/functions`

| Export | Purpose |
|---|---|
| addFcmToken / sendPush*Trigger / onUserDeleted | Push + cleanup |

(Local `driver_registration_v2.js` present; primary registration callables also live under customer/admin codebases.)

## Payment-api codebase

HTTP routes under `src/app/api/payments/*` and `webhooks/ngenius` — create, status, finalize, cancel, refund, health.
