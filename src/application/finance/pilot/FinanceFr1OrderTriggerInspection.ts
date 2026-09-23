/**
 * FR1 synthetic fixture — Order trigger inspection (READ-ONLY evidence).
 * Source: Legacy ara-ban `admin/Admi/firebase/functions/index.js` (+ agent_order_snapshot.js).
 * Admin Next has no Firestore document triggers on `order/{id}`.
 * Does NOT disable Production triggers. Does NOT write Production.
 */

export const ORDER_TRIGGER_INSPECTION = "NO-GO" as const;

export type FinanceFr1TriggerSideEffectClass =
  | "bounded_predictable"
  | "uncontrolled"
  | "none";

export type FinanceFr1OrderTriggerRow = {
  exportName: string;
  type: "firestore.onCreate" | "firestore.onUpdate" | "firestore.onWrite" | "callable";
  pathOrSurface: string;
  firesOnOrderCreate: boolean;
  firesOnOrderUpdate: boolean;
  effect: string;
  classification: FinanceFr1TriggerSideEffectClass;
  notification: boolean;
  wallet: boolean;
  settlement: boolean;
  payment: boolean;
  countersOrStats: boolean;
  location: boolean;
  externalApis: boolean;
  auth: boolean;
  mutatesOrder: boolean;
  mutatesUser: boolean;
  evidence: string;
};

/**
 * Closed inventory of order/{id} side effects relevant to fixture CREATE.
 */
export const FINANCE_FR1_ORDER_TRIGGER_ANALYSIS: readonly FinanceFr1OrderTriggerRow[] =
  [
    {
      exportName: "notifyAdminsOnNewBooking",
      type: "firestore.onCreate",
      pathOrSurface: "order/{orderId}",
      firesOnOrderCreate: true,
      firesOnOrderUpdate: false,
      effect:
        "FCM multicast to super-admins + country agents (Rev_dolh). " +
        "Skip only when halh_order==='Canceled'. May batch-update user FCM tokens " +
        "on invalid-token cleanup. No synthetic/financePilot skip flag.",
      classification: "uncontrolled",
      notification: true,
      wallet: false,
      settlement: false,
      payment: false,
      countersOrStats: false,
      location: false,
      externalApis: true,
      auth: false,
      mutatesOrder: false,
      mutatesUser: true,
      evidence:
        "ara-ban admin/Admi/firebase/functions/index.js notifyAdminsOnNewBooking",
    },
    {
      exportName: "syncAgentSnapshotOnOrderCreate",
      type: "firestore.onCreate",
      pathOrSurface: "order/{orderId}",
      firesOnOrderCreate: true,
      firesOnOrderUpdate: false,
      effect:
        "FIN-9 prospective agent snapshot: queries user for active country agents, " +
        "then merge-writes agent_* fields onto the new order. Skips only when " +
        "agent_id or agent_snapshot_at already present. May attribute a real " +
        "Production agent to a synthetic order if SA has an active agent.",
      classification: "uncontrolled",
      notification: false,
      wallet: false,
      settlement: false,
      payment: false,
      countersOrStats: false,
      location: false,
      externalApis: false,
      auth: false,
      mutatesOrder: true,
      mutatesUser: false,
      evidence:
        "index.js syncAgentSnapshotOnOrderCreate + agent_order_snapshot.js",
    },
    {
      exportName: "createSettlementDraftV2 (and settlement V2 callables)",
      type: "callable",
      pathOrSurface: "https.onCall",
      firesOnOrderCreate: false,
      firesOnOrderUpdate: false,
      effect: "Not auto-invoked on order create/update.",
      classification: "none",
      notification: false,
      wallet: false,
      settlement: true,
      payment: false,
      countersOrStats: false,
      location: false,
      externalApis: false,
      auth: false,
      mutatesOrder: false,
      mutatesUser: false,
      evidence: "index.js Settlement Ledger V2 exports",
    },
    {
      exportName: "confirmCashCollectionV2 / adminConfirmCashCollectionV2",
      type: "callable",
      pathOrSurface: "https.onCall",
      firesOnOrderCreate: false,
      firesOnOrderUpdate: false,
      effect:
        "Cash realization via explicit callable; after success fire-and-forget Admin Next auto-finalize (fail-soft).",
      classification: "none",
      notification: false,
      wallet: false,
      settlement: false,
      payment: true,
      countersOrStats: false,
      location: false,
      externalApis: true,
      auth: false,
      mutatesOrder: false,
      mutatesUser: false,
      evidence: "index.js cash collection + finance_forward_auto_finalize",
    },
    {
      exportName: "onOrderFinanceForwardEligible",
      type: "firestore.onUpdate",
      pathOrSurface: "order/{orderId}",
      firesOnOrderCreate: false,
      firesOnOrderUpdate: true,
      effect:
        "When order becomes completed + payment final, S2S POST Admin Next auto-finalize. Never mutates order.",
      classification: "bounded_predictable",
      notification: false,
      wallet: false,
      settlement: false,
      payment: true,
      countersOrStats: false,
      location: false,
      externalApis: true,
      auth: false,
      mutatesOrder: false,
      mutatesUser: false,
      evidence: "finance_forward_auto_finalize.js",
    },
    {
      exportName: "adminAdjustDriverWallet",
      type: "callable",
      pathOrSurface: "https.onCall",
      firesOnOrderCreate: false,
      firesOnOrderUpdate: false,
      effect: "No wallet auto-create/adjust on order create.",
      classification: "none",
      notification: false,
      wallet: true,
      settlement: false,
      payment: false,
      countersOrStats: false,
      location: false,
      externalApis: false,
      auth: false,
      mutatesOrder: false,
      mutatesUser: false,
      evidence: "index.js adminAdjustDriverWallet",
    },
    {
      exportName: "syncUserClaimsOnWrite",
      type: "firestore.onWrite",
      pathOrSurface: "user/{uid}",
      firesOnOrderCreate: false,
      firesOnOrderUpdate: false,
      effect: "User-doc only — not fired by order create.",
      classification: "none",
      notification: false,
      wallet: false,
      settlement: false,
      payment: false,
      countersOrStats: false,
      location: false,
      externalApis: false,
      auth: true,
      mutatesOrder: false,
      mutatesUser: false,
      evidence: "index.js syncUserClaimsOnWrite",
    },
    {
      exportName: "ensureMkanListVisibilityOnWrite",
      type: "firestore.onWrite",
      pathOrSurface: "mkan/{mkanId}",
      firesOnOrderCreate: false,
      firesOnOrderUpdate: false,
      effect: "Landmark visibility only — not order.",
      classification: "none",
      notification: false,
      wallet: false,
      settlement: false,
      payment: false,
      countersOrStats: false,
      location: true,
      externalApis: false,
      auth: false,
      mutatesOrder: false,
      mutatesUser: false,
      evidence: "index.js ensureMkanListVisibilityOnWrite",
    },
  ];

export type FinanceFr1OrderCreateSideEffectSummary = {
  ORDER_TRIGGER_INSPECTION: typeof ORDER_TRIGGER_INSPECTION;
  customerNotifications: false;
  driverNotifications: false;
  adminAgentFcmNotifications: true;
  wallet: false;
  settlementV2: false;
  paymentRealization: false;
  countersOrStats: false;
  location: false;
  externalApis: true;
  auth: false;
  agentSnapshotOrderMutation: true;
  possibleUserFcmTokenCleanupWrites: true;
  uncontrolledTriggers: readonly string[];
  reason: string;
};

/**
 * Verdict for creating a synthetic completed order via Admin SDK / client write.
 */
export function assessFinanceFr1OrderCreateSideEffects(): FinanceFr1OrderCreateSideEffectSummary {
  const uncontrolled = FINANCE_FR1_ORDER_TRIGGER_ANALYSIS.filter(
    (r) => r.classification === "uncontrolled" && r.firesOnOrderCreate,
  ).map((r) => r.exportName);

  return {
    ORDER_TRIGGER_INSPECTION,
    customerNotifications: false,
    driverNotifications: false,
    adminAgentFcmNotifications: true,
    wallet: false,
    settlementV2: false,
    paymentRealization: false,
    countersOrStats: false,
    location: false,
    externalApis: true,
    auth: false,
    agentSnapshotOrderMutation: true,
    possibleUserFcmTokenCleanupWrites: true,
    uncontrolledTriggers: uncontrolled,
    reason:
      "order/{id} onCreate fires notifyAdminsOnNewBooking (FCM + optional user token writes) " +
      "and syncAgentSnapshotOnOrderCreate (order merge + may attribute real SA agent). " +
      "No Production trigger bypass. ORDER_TRIGGER_INSPECTION=NO-GO.",
  };
}

/** Fixture create into Production `order` is forbidden while inspection is NO-GO. */
export const FINANCE_FR1_ORDER_FIXTURE_CREATE_NO_GO = true as const;
