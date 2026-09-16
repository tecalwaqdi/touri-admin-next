/**
 * Financial periods — Legacy `financial_periods` collection.
 * P1: read model + gated write commands aligned to finance_periods CF semantics.
 */

export type FinancialPeriodStatus = "open" | "closed" | "locked" | "unknown";

export type FinancialPeriodListItem = {
  id: string;
  label: string | null;
  countryId: string | null;
  currencyCode: string | null;
  status: FinancialPeriodStatus;
  periodFromUtc: string | null;
  periodToUtc: string | null;
  openedBy: string | null;
  closedBy: string | null;
};

export type FinancialPeriodWriteAction = "open" | "close" | "lock";

export type FinancialPeriodWriteCommand = {
  actorUid: string;
  periodId: string;
  action: FinancialPeriodWriteAction;
  idempotencyKey: string;
  correlationId: string;
  expectedStatus?: FinancialPeriodStatus;
};

export type FinancialPeriodWriteResult = {
  ok: boolean;
  code: string;
  message: string;
  productionWriteExecuted: false;
  action: FinancialPeriodWriteAction;
  periodId: string;
};

const PERIOD_TRANSITIONS: Record<
  FinancialPeriodStatus,
  readonly FinancialPeriodWriteAction[]
> = {
  open: ["close", "lock"],
  closed: ["lock"],
  locked: [],
  unknown: ["open"],
};

export function canApplyPeriodAction(
  status: FinancialPeriodStatus,
  action: FinancialPeriodWriteAction,
): boolean {
  if (action === "open") return status === "unknown" || status === "closed";
  return PERIOD_TRANSITIONS[status].includes(action);
}

export function executeFinancialPeriodWrite(
  command: FinancialPeriodWriteCommand,
  snap: { status: FinancialPeriodStatus },
  opts?: { allowOfflineExecution?: boolean; financeWriteEnabled?: boolean },
): FinancialPeriodWriteResult {
  const financeOn = opts?.financeWriteEnabled === true;
  if (!opts?.allowOfflineExecution && !financeOn) {
    return {
      ok: false,
      code: "PRODUCTION_WRITE_DISABLED",
      message: "FINANCE_WRITE_ENABLED required (default false)",
      productionWriteExecuted: false,
      action: command.action,
      periodId: command.periodId,
    };
  }
  if (
    command.expectedStatus &&
    command.expectedStatus !== snap.status
  ) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "expectedStatus mismatch",
      productionWriteExecuted: false,
      action: command.action,
      periodId: command.periodId,
    };
  }
  if (!canApplyPeriodAction(snap.status, command.action)) {
    return {
      ok: false,
      code: "ILLEGAL_STATUS_TRANSITION",
      message: `${snap.status} cannot ${command.action}`,
      productionWriteExecuted: false,
      action: command.action,
      periodId: command.periodId,
    };
  }
  return {
    ok: true,
    code: "APPLIED",
    message: "Period write applied offline/Fake (no Production mutation)",
    productionWriteExecuted: false,
    action: command.action,
    periodId: command.periodId,
  };
}

export function mapFinancialPeriodDoc(input: {
  id: string;
  data: Record<string, unknown>;
}): FinancialPeriodListItem {
  const statusRaw = String(input.data.status ?? input.data.halh ?? "")
    .trim()
    .toLowerCase();
  let status: FinancialPeriodStatus = "unknown";
  if (statusRaw.includes("open")) status = "open";
  else if (statusRaw.includes("lock")) status = "locked";
  else if (statusRaw.includes("close")) status = "closed";

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  return {
    id: input.id,
    label: str(input.data.label) ?? str(input.data.naim) ?? str(input.data.name),
    countryId: str(
      typeof input.data.countryId === "string"
        ? input.data.countryId
        : (input.data.countryRef as { id?: string } | undefined)?.id,
    ),
    currencyCode: str(input.data.currencyCode ?? input.data.currency)?.toUpperCase() ?? null,
    status,
    periodFromUtc: str(input.data.periodFromUtc ?? input.data.from),
    periodToUtc: str(input.data.periodToUtc ?? input.data.to),
    openedBy: str(input.data.openedBy),
    closedBy: str(input.data.closedBy),
  };
}
