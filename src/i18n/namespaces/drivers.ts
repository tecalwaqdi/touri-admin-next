export const driversNs = {
  en: {
    driversCount: "Drivers",
    tripsCount: "Trips",
    approveAction: "Approve",
    rejectAction: "Reject",
    requestChangesAction: "Request changes",
    suspendAction: "Suspend",
    reactivateAction: "Reactivate",
    enableAction: "Enable",
    disableAction: "Disable",
    blockAction: "Block",
    activateAction: "Activate",
    deactivateAction: "Deactivate",
    driverActionsTitle: "Driver actions",
    agentActionsTitle: "Agent actions",
    customerActionsTitle: "Customer actions",
    confirmDriverWrite:
      "Confirm {action} for driver {id} (current state: {state})? This applies only if the server state still matches.",
    confirmAgentWrite:
      "Confirm {action} for agent {id} (current state: {state})? This applies only if the server state still matches.",
    confirmCustomerWrite:
      "Confirm {action} for customer {id} (current status: {state})? This applies only if the server state still matches.",
    confirmAgentActivateWarning:
      "Only one active agent is allowed per country. Activation fails closed if another active agent already exists — peers are never auto-deactivated.",
    writeApplied: "Action applied",
  },
  ar: {
    driversCount: "السائقون",
    tripsCount: "الرحلات",
    approveAction: "اعتماد",
    rejectAction: "رفض",
    requestChangesAction: "طلب تعديلات",
    suspendAction: "إيقاف",
    reactivateAction: "إعادة تفعيل",
    enableAction: "تفعيل",
    disableAction: "تعطيل",
    blockAction: "حظر",
    activateAction: "تفعيل",
    deactivateAction: "إلغاء التفعيل",
    driverActionsTitle: "إجراءات السائق",
    agentActionsTitle: "إجراءات الوكيل",
    customerActionsTitle: "إجراءات العميل",
    confirmDriverWrite:
      "تأكيد {action} للسائق {id} (الحالة الحالية: {state})؟ يُطبَّق فقط إذا بقيت حالة الخادم مطابقة.",
    confirmAgentWrite:
      "تأكيد {action} للوكيل {id} (الحالة الحالية: {state})؟ يُطبَّق فقط إذا بقيت حالة الخادم مطابقة.",
    confirmCustomerWrite:
      "تأكيد {action} للعميل {id} (الحالة الحالية: {state})؟ يُطبَّق فقط إذا بقيت حالة الخادم مطابقة.",
    confirmAgentActivateWarning:
      "يُسمح بوكيل نشط واحد فقط لكل دولة. يفشل التفعيل بشكل آمن إذا وُجد وكيل نشط آخر — ولن يُلغَ تفعيل الأقران تلقائيًا.",
    writeApplied: "تم تطبيق الإجراء",
  },
} as const;
