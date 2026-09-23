/**
 * PC-5 — Finance presentation terminology (AR/EN).
 * Presentation only: does NOT rename domain/storage fields or change calculations.
 * Inspected against FR7 CompanyFinanceMetrics / Settlement V2 / FR6 correction semantics.
 */

export type FinanceLocale = "en" | "ar";

export type FinanceTermEntry = {
  en: string;
  ar: string;
  /** Short operator tooltip — not legal advice. */
  tipEn?: string;
  tipAr?: string;
};

/**
 * Internal key → business labels.
 * `platformCommission` is Legacy `total_app` / company take — labeled Company Commission.
 * `companyCommission` is an alias key for the same business concept (not a separate metric).
 */
export const FINANCE_TERMINOLOGY: Readonly<Record<string, FinanceTermEntry>> = {
  global: { en: "All authorized countries", ar: "كل الدول المصرح بها" },
  agent: { en: "Agent", ar: "الوكيل" },
  boundedWindow: {
    en: "This view uses a bounded Production sample window — amounts are complete for the loaded records, not necessarily all-time business totals.",
    ar: "هذا العرض يعتمد نافذة عيّنة محدودة من الإنتاج — المبالغ مكتملة للسجلات المحمّلة وليست بالضرورة إجماليات الأعمال طوال الوقت.",
  },
  noCertifiedSnapshots: {
    en: "No certified accounting snapshots in this window. Booking, commission, and collection KPIs require persisted Finance SoT snapshots — trip counts alone are not used. Settlements below remain authoritative.",
    ar: "لا توجد لقطات محاسبية معتمدة في النافذة. مؤشرات الحجوزات والعمولة والتحصيل تتطلب لقطات مالية معتمدة — أعداد الرحلات وحدها لا تُستخدم. التسويات أدناه تبقى المرجع المعتمد.",
  },
  snapshotWriteGateHint: {
    en: "Creating certified snapshots requires Finance write arming: FINANCE_WRITE_ENABLED=true together with GLOBAL_PRODUCTION_WRITE_ENABLED and PRODUCTION_WRITE_ENABLED, plus an approved FR1/snapshot apply session. Domain current-ops already encodes 1 SAR electronic gateway fee for new materializations — Production writes are not auto-armed.",
    ar: "إنشاء اللقطات المعتمدة يتطلب تسليح كتابة المالية: FINANCE_WRITE_ENABLED=true مع GLOBAL_PRODUCTION_WRITE_ENABLED وPRODUCTION_WRITE_ENABLED، إضافة إلى جلسة تطبيق FR1/لقطة معتمدة. القاعدة المحاسبية الحالية (١ ريال لرسوم البوابة على الدفع الإلكتروني) مُرمَّزة للمجال للقطات الجديدة — ولا يتم تسليح كتابة الإنتاج تلقائيًا.",
  },
  openSettlements: {
    en: "Open settlements",
    ar: "فتح التسويات",
  },
  snapshotBackedMetricsHidden: {
    en: "Company revenue metrics are hidden until certified accounting snapshots are available.",
    ar: "مؤشرات إيرادات الشركة مخفية إلى أن تتوفر لقطات محاسبية معتمدة.",
  },
  id: { en: "Reference", ar: "المعرّف" },
  value: { en: "Result", ar: "النتيجة" },
  relatedSettlementId: { en: "Related settlement", ar: "التسوية المرتبطة" },
  snapshotMatchesSettlement: { en: "Source and settlement match", ar: "تطابق المصدر والتسوية" },
  claimMatchesCommission: { en: "Claims and commission match", ar: "تطابق المطالبات والعمولة" },
  outstandingConsistent: { en: "Outstanding balance consistency", ar: "اتساق الرصيد المتبقي" },
  grossBookingValue: {
    en: "Gross Booking Value",
    ar: "إجمالي قيمة الحجوزات",
    tipEn: "Sum of booking gross fares in scope — not the same as eligible revenue.",
    tipAr: "مجموع الأجرة الإجمالية للحجوزات ضمن النطاق — يختلف عن الإيراد المؤهل.",
  },
  grossFare: {
    en: "Gross Fare",
    ar: "الأجرة الإجمالية",
  },
  eligibleRevenue: {
    en: "Eligible Revenue",
    ar: "الإيراد المؤهل للاحتساب",
    tipEn: "Revenue eligible for commission accounting — not total gross bookings.",
    tipAr: "الإيراد المؤهل لاحتساب العمولة — ليس إجمالي الحجوزات.",
  },
  companyAllocation: {
    en: "Company Allocation",
    ar: "حصة الشركة",
  },
  companyCommission: {
    en: "Company Commission",
    ar: "عمولة الشركة",
    tipEn: "Company commission (platform take) — not VAT and not gateway fees.",
    tipAr: "عمولة الشركة — ليست ضريبة القيمة المضافة وليست رسوم البوابة.",
  },
  platformCommission: {
    en: "Company Commission",
    ar: "عمولة الشركة",
    tipEn: "Company commission (platform take / total_app) — not VAT and not gateway fees.",
    tipAr: "عمولة الشركة (حصة المنصة) — ليست الضريبة وليست رسوم البوابة.",
  },
  commissionRate: {
    en: "Commission Rate",
    ar: "نسبة العمولة",
  },
  commission: {
    en: "Commission",
    ar: "العمولة",
  },
  driverGross: {
    en: "Driver Gross Earnings",
    ar: "إجمالي أرباح السائق",
  },
  grossEarnings: {
    en: "Driver Gross Earnings",
    ar: "إجمالي أرباح السائق",
  },
  driverDeductions: {
    en: "Driver Deductions",
    ar: "استقطاعات السائق",
  },
  deductions: {
    en: "Deductions",
    ar: "الاستقطاعات",
  },
  driverNet: {
    en: "Driver Net Amount",
    ar: "صافي مستحق السائق",
  },
  gatewayFees: {
    en: "Payment Gateway Fees",
    ar: "رسوم بوابة الدفع",
    tipEn:
      "Payment processor fees — distinct from company commission. Current ops: 1.00 of trip currency per electronic/card payment (1 SAR when SAR); cash = 0; borne by the Agent as a separate component (not silent earnings deduction). Historical snapshot amounts remain authoritative.",
    tipAr:
      "رسوم معالج الدفع — تختلف عن عمولة الشركة. التشغيل الحالي: ١٫٠٠ من عملة الرحلة لكل دفع إلكتروني (١ ريال عند SAR)؛ النقد = ٠؛ يتحملها الوكيل كمكون مستقل (بدون خصم صامت من الأرباح). المبالغ التاريخية في اللقطات تبقى المرجع.",
  },
  discounts: {
    en: "Discounts",
    ar: "الخصومات",
  },
  refunds: {
    en: "Refunds",
    ar: "المبالغ المستردة",
    tipEn: "Customer refunds — not the same as chargebacks or adjustments.",
    tipAr: "استرداد للعميل — يختلف عن الاسترداد القسري والتسويات.",
  },
  chargebacks: {
    en: "Chargebacks",
    ar: "عمليات الاسترداد القسري",
    tipEn: "Card network chargebacks — distinct from refunds and adjustments.",
    tipAr: "استرداد قسري من الشبكة — يختلف عن الاسترداد والتسويات.",
  },
  adjustments: {
    en: "Adjustments",
    ar: "التسويات المالية",
    tipEn: "Append-only monetary corrections — not refunds or chargebacks.",
    tipAr: "تصحيحات مالية ملحقة — ليست استردادًا ولا استردادًا قسريًا.",
  },
  adjustmentsMonetary: {
    en: "Monetary Adjustments",
    ar: "تسويات مالية",
    tipEn: "Sum of monetary adjustments only — neutral memos are excluded.",
    tipAr: "مجموع التسويات ذات الأثر المالي فقط — المذكرات المحايدة مستثناة.",
  },
  adjustmentsReversals: {
    en: "Adjustments & Reversals",
    ar: "التسويات والعكس",
  },
  reversals: {
    en: "Reversals",
    ar: "عمليات عكس القيود",
  },
  paidConfirmed: {
    en: "Confirmed Paid Amount",
    ar: "المبلغ المسدد والمؤكد",
    tipEn: "Amount confirmed collected/paid on the settlement — not merely marked paid.",
    tipAr: "المبلغ المؤكد تحصيله/سداده على التسوية — ليس مجرد حالة مدفوع.",
  },
  paid: {
    en: "Paid",
    ar: "مدفوع",
  },
  outstanding: {
    en: "Outstanding Balance",
    ar: "الرصيد المستحق",
    tipEn: "Remaining unpaid balance — not the full settlement total.",
    tipAr: "الرصيد المتبقي غير المسدد — ليس إجمالي مبلغ التسوية.",
  },
  outstandingAmount: {
    en: "Outstanding Balance",
    ar: "الرصيد المستحق",
  },
  settlementAmount: {
    en: "Settlement Amount",
    ar: "مبلغ التسوية",
  },
  claimAmount: {
    en: "Claim Amount",
    ar: "مبلغ المطالبة",
  },
  collectedCash: {
    en: "Cash Collected",
    ar: "التحصيل النقدي",
  },
  agentCollectedCash: {
    en: "Agent Cash Collected",
    ar: "تحصيل نقدي للوكيل",
  },
  electronicCardReceipts: {
    en: "Card / Online Receipts",
    ar: "التحصيل الإلكتروني",
  },
  companyReceivable: {
    en: "Company Receivable",
    ar: "مستحقات الشركة لنا",
  },
  companyPayable: {
    en: "Company Payable",
    ar: "مستحقات علينا للشركة",
  },
  receivables: {
    en: "Receivables",
    ar: "مستحقات لنا",
  },
  payables: {
    en: "Payables",
    ar: "مستحقات علينا",
  },
  driverPayable: {
    en: "Driver Payable",
    ar: "مستحق للسائق",
  },
  driverReceivable: {
    en: "Driver Receivable",
    ar: "مستحق على السائق",
  },
  amountOwedToCompany: {
    en: "Amount Owed to Company",
    ar: "المبلغ المستحق للشركة",
  },
  amountOwedByCompany: {
    en: "Amount Owed by Company",
    ar: "المبلغ المستحق على الشركة",
  },
  settled: {
    en: "Settled",
    ar: "مُسوّى",
  },
  settledAmount: {
    en: "Settled Amount",
    ar: "المبلغ المُسوّى",
  },
  disputedSuspense: {
    en: "Disputed / Suspense",
    ar: "متنازع / معلّق",
  },
  disputed: {
    en: "Disputed",
    ar: "متنازع عليه",
  },
  netRecognizedPosition: {
    en: "Net Recognized Position",
    ar: "المركز الصافي المعترف به",
  },
  currentReconciledPosition: {
    en: "Current Reconciled Position",
    ar: "المركز المطابق الحالي",
  },
  vatTax: {
    en: "VAT / Tax",
    ar: "ضريبة القيمة المضافة",
    tipEn: "Tax amount — distinct from company commission.",
    tipAr: "مبلغ الضريبة — يختلف عن عمولة الشركة.",
  },
  vat: {
    en: "VAT / Tax",
    ar: "ضريبة القيمة المضافة",
  },
  currency: {
    en: "Currency",
    ar: "العملة",
  },
  direction: {
    en: "Direction",
    ar: "الاتجاه",
  },
  paymentMethod: {
    en: "Payment Method",
    ar: "طريقة الدفع",
  },
  status: {
    en: "Status",
    ar: "الحالة",
  },
  source: {
    en: "Source",
    ar: "المصدر",
  },
  availability: {
    en: "Data Availability",
    ar: "توافر البيانات",
  },
  incompleteReasons: {
    en: "Incomplete Reasons",
    ar: "أسباب عدم الاكتمال",
  },
  amountMinor: {
    en: "Amount (minor units)",
    ar: "المبلغ (وحدات صغرى)",
  },
  /** Prefer formatted major in UI; this key must never be a visible primary label. */
  metric: {
    en: "Metric",
    ar: "المؤشر",
  },
  party: {
    en: "Party",
    ar: "الطرف",
  },
  driver: {
    en: "Driver",
    ar: "السائق",
  },
  new: {
    en: "New",
    ar: "جديد",
  },
  missing: {
    en: "Missing",
    ar: "مفقود",
  },
  companyAmountDue: {
    en: "Company Amount Due",
    ar: "المبلغ المستحق للشركة",
  },
  agentEntitlement: {
    en: "Agent Entitlement",
    ar: "مستحق الوكيل",
  },
  settlementsDue: {
    en: "Settlements Due",
    ar: "تسويات مستحقة",
  },
  // UI chrome / sections
  businessVolume: {
    en: "Business Volume",
    ar: "حجم الأعمال",
  },
  companyRevenue: {
    en: "Company Revenue",
    ar: "إيرادات الشركة",
  },
  driverPosition: {
    en: "Driver Position",
    ar: "مركز السائق",
  },
  settlementsSection: {
    en: "Settlements",
    ar: "التسويات",
  },
  correctionsSection: {
    en: "Corrections",
    ar: "التصحيحات",
  },
  byCurrency: {
    en: "By Currency (no mix)",
    ar: "حسب العملة (بدون خلط)",
  },
  scope: {
    en: "Scope",
    ar: "النطاق",
  },
  completeness: {
    en: "Completeness",
    ar: "الاكتمال",
  },
  recon: {
    en: "Reconciliation",
    ar: "المطابقة",
  },
  settlementId: {
    en: "Settlement ID",
    ar: "معرّف التسوية",
  },
  country: {
    en: "Country",
    ar: "الدولة",
  },
  confirmedPaid: {
    en: "Confirmed Paid",
    ar: "مسدد ومؤكد",
  },
  preparedBy: {
    en: "Prepared By",
    ar: "أعدّه",
  },
  approvedBy: {
    en: "Approved By",
    ar: "اعتمده",
  },
  updatedAt: {
    en: "Updated At",
    ar: "آخر تحديث",
  },
  overview: {
    en: "Overview",
    ar: "نظرة عامة",
  },
  partyScope: {
    en: "Party / Scope",
    ar: "الطرف / النطاق",
  },
  amounts: {
    en: "Amounts",
    ar: "المبالغ",
  },
  paymentProgress: {
    en: "Payment Progress",
    ar: "تقدم السداد",
  },
  approvalExecution: {
    en: "Approval / Execution",
    ar: "الاعتماد / التنفيذ",
  },
  sourceLinkage: {
    en: "Source Linkage",
    ar: "الربط بالمصدر",
  },
  claims: {
    en: "Claims",
    ar: "المطالبات",
  },
  payments: {
    en: "Payments",
    ar: "المدفوعات",
  },
  relatedCorrections: {
    en: "Related Corrections",
    ar: "التصحيحات المرتبطة",
  },
  kind: {
    en: "Type",
    ar: "النوع",
  },
  monetaryEffect: {
    en: "Monetary Effect",
    ar: "أثر مالي؟",
  },
  signedImpact: {
    en: "Signed Impact",
    ar: "الأثر الموقّع",
  },
  yes: {
    en: "Yes",
    ar: "نعم",
  },
  no: {
    en: "No",
    ar: "لا",
  },
  period: {
    en: "Period",
    ar: "الفترة",
  },
  sourceSnapshot: {
    en: "Source Snapshot",
    ar: "لقطة المصدر",
  },
  exportCsv: {
    en: "Export CSV",
    ar: "تصدير CSV",
  },
  report: {
    en: "Report",
    ar: "التقرير",
  },
  all: {
    en: "All",
    ar: "الكل",
  },
  details: {
    en: "Details",
    ar: "التفاصيل",
  },
  agentId: {
    en: "Agent ID",
    ar: "معرّف الوكيل",
  },
  driverId: {
    en: "Driver ID",
    ar: "معرّف السائق",
  },
  walletBalance: {
    en: "Wallet balance",
    ar: "رصيد المحفظة",
    tipEn: "Persisted wallet balance from Finance SoT — missing is not shown as zero.",
    tipAr: "رصيد المحفظة من مصدر الحقيقة المالي — الناقص لا يُعرض كصفر.",
  },
  walletLedger: {
    en: "Wallet ledger",
    ar: "سجل المحفظة",
  },
  driverWalletsSotNote: {
    en: "Driver wallets are read-only from the wallets / transactions Source of Truth. Missing balances show as unavailable — never invented as zero. Adjustments remain gated Finance writes.",
    ar: "محافظ المناديب للقراءة فقط من مصدر الحقيقة (wallets / transactions). الأرصدة الناقصة تظهر كغير متاحة — ولا تُختلق كصفر. التعديلات تبقى تحت بوابة كتابة المالية.",
  },
  ledgerType: {
    en: "Type",
    ar: "النوع",
  },
  countryFinance: {
    en: "Country Finance",
    ar: "مالية الدولة",
  },
  agentFinance: {
    en: "Agent Finance",
    ar: "مالية الوكيل",
  },
  driverFinance: {
    en: "Driver Finance",
    ar: "مالية السائق",
  },
  activeAgent: {
    en: "Active Agent",
    ar: "الوكيل النشط",
  },
  invariant: {
    en: "Invariant",
    ar: "القيد",
  },
  pilotNotice: {
    en: "Internal: pilot/test finance rows are included in this view.",
    ar: "داخلي: يتضمن هذا العرض صفوف مالية تجريبية/اختبارية.",
  },
  settlementPayments: {
    en: "Settlement payments",
    ar: "مدفوعات التسوية",
  },
  paymentAmountMinor: {
    en: "Amount (minor units)",
    ar: "المبلغ (وحدات صغرى)",
  },
  createPayment: {
    en: "Create payment",
    ar: "إنشاء دفعة",
  },
  confirmPayment: {
    en: "Confirm",
    ar: "تأكيد",
  },
  reversePayment: {
    en: "Reverse",
    ar: "عكس",
  },
  outstandingServer: {
    en: "Outstanding (server)",
    ar: "الرصيد المستحق (من الخادم)",
  },
  driverPositionUnavailable: {
    en: "Driver position metrics are not on the company dashboard — open Driver Finance report.",
    ar: "مؤشرات مركز السائق غير متاحة في ملخص الشركة — استخدم تقرير مالية السائق.",
  },
  amount: {
    en: "Amount",
    ar: "المبلغ",
  },
  explanation: {
    en: "Explanation",
    ar: "التوضيح",
  },
  noMatchingRecords: {
    en: "No matching records",
    ar: "لا توجد بيانات مطابقة",
  },
  dataUnavailable: {
    en: "Data currently unavailable",
    ar: "البيانات غير متاحة حاليًا",
  },
  financialIncomplete: {
    en: "Financial data incomplete",
    ar: "البيانات المالية غير مكتملة",
  },
  financeForbidden: {
    en: "You do not have permission to view this data",
    ar: "ليست لديك صلاحية لعرض هذه البيانات",
  },
  neutralMemo: {
    en: "Neutral memo — no monetary effect",
    ar: "مذكرة محايدة — بدون أثر مالي",
  },
  monetaryYes: {
    en: "Yes — monetary",
    ar: "نعم — ذو أثر مالي",
  },
  monetaryNo: {
    en: "No — memo only",
    ar: "لا — مذكرة فقط",
  },
};

/** Keys that must never appear as visible UI labels. */
export const FORBIDDEN_RAW_FINANCE_UI_LABELS = [
  "grossBookingValue",
  "eligibleRevenue",
  "companyAllocation",
  "companyCommission",
  "platformCommission",
  "gatewayFees",
  "paidConfirmed",
  "amountMinor",
  "incompleteReasons",
  "adjustmentsMonetary",
] as const;

export const SETTLEMENT_DIRECTION_LABELS: Readonly<
  Record<string, FinanceTermEntry>
> = {
  DRIVER_PAYS_COMPANY: {
    en: "Driver Pays Company",
    ar: "السائق مدين للشركة",
  },
  COMPANY_PAYS_DRIVER: {
    en: "Company Pays Driver",
    ar: "الشركة تدفع للسائق",
  },
  AGENT_PAYS_COMPANY: {
    en: "Agent Pays Company",
    ar: "الوكيل مدين للشركة",
  },
  COMPANY_PAYS_AGENT: {
    en: "Company Pays Agent",
    ar: "الشركة تدفع للوكيل",
  },
};

export const CORRECTION_KIND_LABELS: Readonly<Record<string, FinanceTermEntry>> =
  {
    adjustment: { en: "Adjustment", ar: "تسوية مالية" },
    reversal: { en: "Reversal", ar: "عكس قيد" },
    refund: { en: "Refund", ar: "مبلغ مسترد" },
    chargeback: { en: "Chargeback", ar: "استرداد قسري" },
    neutral_memo: {
      en: "Neutral memo — no monetary effect",
      ar: "مذكرة محايدة — بدون أثر مالي",
    },
  };

export const REPORT_TYPE_LABELS: Readonly<Record<string, FinanceTermEntry>> = {
  finance_dashboard: {
    en: "Financial Summary",
    ar: "الملخص المالي",
  },
  country_finance: {
    en: "Finance by Country",
    ar: "التقرير المالي حسب الدولة",
  },
  agent_finance: {
    en: "Agent Finance Report",
    ar: "التقرير المالي للوكيل",
  },
  driver_finance: {
    en: "Driver Finance Report",
    ar: "التقرير المالي للسائق",
  },
  settlement_summary: {
    en: "Settlements Report",
    ar: "تقرير التسويات",
  },
  reconciliation_indicators: {
    en: "Reconciliation Report",
    ar: "تقرير المطابقة والتسوية",
  },
  corrections_visibility: {
    en: "Financial Corrections Report",
    ar: "تقرير التصحيحات المالية",
  },
};

/** CSV / export column header map (internal header → business label). */
export const REPORT_EXPORT_HEADER_LABELS: Readonly<
  Record<string, FinanceTermEntry>
> = {
  metric: FINANCE_TERMINOLOGY.metric!,
  amountMinor: FINANCE_TERMINOLOGY.amountMinor!,
  currency: FINANCE_TERMINOLOGY.currency!,
  availability: FINANCE_TERMINOLOGY.availability!,
  incompleteReasons: FINANCE_TERMINOLOGY.incompleteReasons!,
};

export const MONEY_AVAILABILITY_LABELS: Readonly<
  Record<string, FinanceTermEntry>
> = {
  available: { en: "Available", ar: "متاح" },
  missing: { en: "Missing data", ar: "بيانات مفقودة" },
  unknown: { en: "Unknown", ar: "غير معروف" },
  not_represented: { en: "Not applicable", ar: "غير منطبق" },
  incomplete: { en: "Incomplete data", ar: "بيانات غير مكتملة" },
  policy_blocked: { en: "Unavailable", ar: "غير متاح" },
  unavailable: { en: "Unavailable", ar: "غير متاح" },
};

export function presentFinanceTerm(
  key: string,
  locale: FinanceLocale = "en",
): string {
  const entry = FINANCE_TERMINOLOGY[key];
  if (!entry) return key;
  return locale === "ar" ? entry.ar : entry.en;
}

export function financeTermTooltip(
  key: string,
  locale: FinanceLocale = "en",
): string | undefined {
  const entry = FINANCE_TERMINOLOGY[key];
  if (!entry) return undefined;
  return locale === "ar" ? entry.tipAr : entry.tipEn;
}

export function presentSettlementDirection(
  direction: string | null | undefined,
  locale: FinanceLocale = "en",
): string {
  if (!direction) {
    return locale === "ar" ? "غير معروف" : "Unknown";
  }
  const entry = SETTLEMENT_DIRECTION_LABELS[direction];
  if (!entry) return direction;
  return locale === "ar" ? entry.ar : entry.en;
}

export function presentCorrectionKind(
  kind: string | null | undefined,
  locale: FinanceLocale = "en",
  opts?: { directionOrKind?: string | null; monetaryEffect?: boolean },
): string {
  if (opts?.directionOrKind === "neutral_memo" || kind === "neutral_memo") {
    const n = CORRECTION_KIND_LABELS.neutral_memo!;
    return locale === "ar" ? n.ar : n.en;
  }
  if (opts?.monetaryEffect === false && kind === "adjustment") {
    const n = CORRECTION_KIND_LABELS.neutral_memo!;
    return locale === "ar" ? n.ar : n.en;
  }
  if (!kind) {
    return locale === "ar" ? "غير معروف" : "Unknown";
  }
  const entry = CORRECTION_KIND_LABELS[kind];
  if (!entry) return kind;
  return locale === "ar" ? entry.ar : entry.en;
}

export function presentReportType(
  reportType: string,
  locale: FinanceLocale = "en",
): string {
  const entry = REPORT_TYPE_LABELS[reportType];
  if (!entry) return reportType;
  return locale === "ar" ? entry.ar : entry.en;
}

export function presentReportExportHeaders(
  headers: string[],
  locale: FinanceLocale = "en",
): string[] {
  return headers.map((h) => {
    const mapped =
      REPORT_EXPORT_HEADER_LABELS[h] ?? FINANCE_TERMINOLOGY[h] ?? null;
    if (!mapped) return h;
    return locale === "ar" ? mapped.ar : mapped.en;
  });
}

export function presentMoneyAvailability(
  availability: string,
  locale: FinanceLocale = "en",
): string {
  const entry = MONEY_AVAILABILITY_LABELS[availability];
  if (!entry) {
    return locale === "ar" ? "غير متاح" : "Unavailable";
  }
  return locale === "ar" ? entry.ar : entry.en;
}

export function isForbiddenRawFinanceUiLabel(label: string): boolean {
  return (FORBIDDEN_RAW_FINANCE_UI_LABELS as readonly string[]).includes(label);
}
