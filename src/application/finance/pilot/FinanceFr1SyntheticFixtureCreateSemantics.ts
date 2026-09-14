/**
 * FR1 synthetic fixture — create-only semantics + gates.
 * Default SKIP. ORDER path refused (ORDER_TRIGGER_INSPECTION=NO-GO).
 * Registry path is the APPROVED isolated strategy when fully gated.
 */

import {
  FINANCE_FR1_ORDER_FIXTURE_CREATE_NO_GO,
  ORDER_TRIGGER_INSPECTION,
} from "@/application/finance/pilot/FinanceFr1OrderTriggerInspection";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export type FinanceFr1SyntheticFixtureCreateDenialCode =
  | "FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SKIP"
  | "ORDER_TRIGGER_INSPECTION_NO_GO"
  | "ORDER_PATH_CREATE_FORBIDDEN"
  | "FINANCE_WRITE_MUST_REMAIN_FALSE"
  | "WRITE_FLAGS_MUST_REMAIN_FALSE"
  | "PROJECT_ID_MISMATCH"
  | "DOCUMENT_ID_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "FIXTURE_ALREADY_EXISTS"
  | "SETTLEMENT_V2_FORBIDDEN"
  | "PREPARATION_BUILD_NO_MUTATION";

export type FinanceFr1SyntheticFixtureCreateTarget =
  | "order"
  | "registry";

export type FinanceFr1SyntheticFixtureCreateSemantics = {
  readonly mode: "create_only";
  readonly merge: false;
  readonly overwrite: false;
  readonly applyToExisting: false;
  readonly onAlreadyExists: "FIXTURE_ALREADY_EXISTS";
  readonly settlementV2: false;
  readonly driverMutation: false;
  readonly agentMutation: false;
  readonly customerMutation: false;
  readonly financeAccountingSnapshots: false;
  readonly idempotencyKey: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY;
  readonly orderId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  readonly registryCollection: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION;
  readonly registryDocId: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID;
  readonly expectedProvisioningWrites: 2;
};

export const FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SEMANTICS: FinanceFr1SyntheticFixtureCreateSemantics =
  {
    mode: "create_only",
    merge: false,
    overwrite: false,
    applyToExisting: false,
    onAlreadyExists: "FIXTURE_ALREADY_EXISTS",
    settlementV2: false,
    driverMutation: false,
    agentMutation: false,
    customerMutation: false,
    financeAccountingSnapshots: false,
    idempotencyKey: FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
    orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    registryCollection: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
    registryDocId: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
    expectedProvisioningWrites: 2,
  };

export type FinanceFr1SyntheticFixtureCreateGateResult =
  | {
      ok: true;
      target: "registry";
      wouldCreate: true;
      actualCreate: false;
      expectedWrites: 2;
      message: string;
    }
  | {
      ok: false;
      code: FinanceFr1SyntheticFixtureCreateDenialCode;
      wouldCreate: false;
      actualCreate: false;
      message: string;
    };

/**
 * Evaluate create gate.
 * Direct order create always denied while ORDER_TRIGGER_INSPECTION=NO-GO.
 * Registry path returns ok when CREATE=1 + project/doc/idempotency match +
 * FINANCE_WRITE_ENABLED false + domain write flags false.
 * actualCreate remains false until the live provision harness mutates.
 */
export function evaluateFinanceFr1SyntheticFixtureCreateGate(input: {
  FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE?: string;
  target?: FinanceFr1SyntheticFixtureCreateTarget;
  projectId?: string;
  documentId?: string;
  idempotencyKey?: string;
  documentAlreadyExists?: boolean;
  expectedProjectId?: string;
  financeWriteEnabled?: boolean;
  writeFlagsAllFalse?: boolean;
  settlementV2Requested?: boolean;
}): FinanceFr1SyntheticFixtureCreateGateResult {
  if (input.FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE !== "1") {
    return {
      ok: false,
      code: "FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SKIP",
      wouldCreate: false,
      actualCreate: false,
      message: `${FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV} unset/≠1 → SKIP`,
    };
  }

  if (input.financeWriteEnabled === true) {
    return {
      ok: false,
      code: "FINANCE_WRITE_MUST_REMAIN_FALSE",
      wouldCreate: false,
      actualCreate: false,
      message: "FINANCE_WRITE_ENABLED must remain false during fixture provisioning",
    };
  }

  if (input.writeFlagsAllFalse === false) {
    return {
      ok: false,
      code: "WRITE_FLAGS_MUST_REMAIN_FALSE",
      wouldCreate: false,
      actualCreate: false,
      message: "Driver/Agent/Customer/Global write flags must remain false",
    };
  }

  if (input.settlementV2Requested === true) {
    return {
      ok: false,
      code: "SETTLEMENT_V2_FORBIDDEN",
      wouldCreate: false,
      actualCreate: false,
      message: "Settlement V2 forbidden during fixture provisioning",
    };
  }

  const target = input.target ?? "order";
  if (target === "order") {
    return {
      ok: false,
      code: "ORDER_PATH_CREATE_FORBIDDEN",
      wouldCreate: false,
      actualCreate: false,
      message:
        `ORDER_TRIGGER_INSPECTION=${ORDER_TRIGGER_INSPECTION} — ` +
        "do not create Production order/{id}; use isolated registry strategy",
    };
  }

  if (ORDER_TRIGGER_INSPECTION === "NO-GO" && FINANCE_FR1_ORDER_FIXTURE_CREATE_NO_GO) {
    // Registry path is the isolated APPROVED mechanism (order path still NO-GO).
  }

  const expectedProjectId =
    input.expectedProjectId ?? FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID;
  if (!input.projectId || input.projectId.trim() !== expectedProjectId) {
    return {
      ok: false,
      code: "PROJECT_ID_MISMATCH",
      wouldCreate: false,
      actualCreate: false,
      message: "projectId mismatch",
    };
  }

  if (
    !input.documentId ||
    (input.documentId.trim() !== FINANCE_FR1_SYNTHETIC_ORDER_ID &&
      input.documentId.trim() !== FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID)
  ) {
    return {
      ok: false,
      code: "DOCUMENT_ID_MISMATCH",
      wouldCreate: false,
      actualCreate: false,
      message: "documentId must be dedicated FR1 synthetic fixture id",
    };
  }

  if (
    !input.idempotencyKey ||
    input.idempotencyKey.trim() !== FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY
  ) {
    return {
      ok: false,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      wouldCreate: false,
      actualCreate: false,
      message: "idempotency key required / mismatch",
    };
  }

  if (input.documentAlreadyExists === true) {
    return {
      ok: false,
      code: "FIXTURE_ALREADY_EXISTS",
      wouldCreate: false,
      actualCreate: false,
      message: "FIXTURE_ALREADY_EXISTS — no overwrite / merge (0 writes)",
    };
  }

  return {
    ok: true,
    target: "registry",
    wouldCreate: true,
    actualCreate: false,
    expectedWrites: 2,
    message:
      "Registry create gates OPEN — isolated create-only provisioning allowed " +
      `(${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION}:1 + admin_next_cw_idempotency:1); ` +
      "invoke live provision harness to mutate (not this prep session)",
  };
}
