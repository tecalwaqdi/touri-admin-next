export const usersNs = {
  en: {
    role: "Role",
    scope: "Scope",
    permissions: "Permissions",
    permissionCount: "Permission count",
    rolesMatrixHint:
      "Read-only matrix from server RBAC code — not editable here",
    rolesPermissionsCodeSoT:
      "Permissions are defined in code (source of truth) — this matrix is display-only and intentionally immutable.",
    actor: "Actor",
    action: "Action",
    resourceType: "Resource type",
    resource: "Resource",
    time: "Time",
    auditId: "Audit ID",
    correlation: "Correlation",
    reason: "Reason",
    before: "Before",
    after: "After",
    selectEvent: "Select an event",
    auditCwHint:
      "Controlled-write audit (Admin Next). Finance audit is separate.",
    result: "Result",
    identityMapped: "Mapped identity",
    identityUnmapped: "Unmapped identity",
    createPersonaAction: "Create persona",
    createPersonaHint:
      "Creates an allowlisted panel persona for an Auth UID. Production writes stay gated; Fake/offline when chrome + development.",
    createPersonaQaFixture: "Mark as QA / synthetic fixture (recommended)",
    assignAgentScopeAction: "Assign agent scope",
    agentId: "Agent ID",
    identityEscalationDenied:
      "Cannot assign a role above the actor's authority",
  },
  ar: {
    role: "الدور",
    scope: "النطاق",
    permissions: "الصلاحيات",
    permissionCount: "عدد الصلاحيات",
    rolesMatrixHint:
      "مصفوفة للقراءة فقط من شيفرة الصلاحيات — غير قابلة للتعديل هنا",
    rolesPermissionsCodeSoT:
      "الصلاحيات معرّفة في الشيفرة (مصدر الحقيقة) — هذه المصفوفة للعرض فقط وغير قابلة للتعديل عمدًا.",
    actor: "المنفّذ",
    action: "الإجراء",
    resourceType: "نوع المورد",
    resource: "المورد",
    time: "الوقت",
    auditId: "معرّف التدقيق",
    correlation: "الارتباط",
    reason: "السبب",
    before: "قبل",
    after: "بعد",
    selectEvent: "اختر حدثًا",
    auditCwHint:
      "تدقيق الكتابة المنضبطة (Admin Next). تدقيق المالية منفصل.",
    result: "النتيجة",
    identityMapped: "هوية مرتبطة",
    identityUnmapped: "هوية غير مرتبطة",
    createPersonaAction: "إنشاء شخصية",
    createPersonaHint:
      "ينشئ شخصية لوحة مسموحة لمعرّف Auth. تبقى كتابات الإنتاج مغلقة؛ المسار الوهمي عند تفعيل الواجهة + التطوير.",
    createPersonaQaFixture: "وضع علامة QA / اصطناعي (موصى به)",
    assignAgentScopeAction: "تعيين نطاق الوكيل",
    agentId: "معرّف الوكيل",
    identityEscalationDenied:
      "لا يمكن تعيين دور أعلى من صلاحية المنفّذ",
  },
} as const;
