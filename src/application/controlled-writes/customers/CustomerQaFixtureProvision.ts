/**
 * QA-only Customer fixture ensure — ops_writer createDocument on `user/{id}`.
 * Never creates Auth users. Never touches Driver/Agent personas.
 */

import { assertCustomerProductionWriteEnabled } from "@/application/controlled-writes/customers/CustomerWriteFlags";
import type { CustomerWriteFlagGate } from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";
import {
  isExplicitQaId,
  qaFirestoreMarkers,
} from "@/application/controlled-writes/pilot/SyntheticFixtureFactory";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

export type EnsureCustomerQaFixtureInput = {
  customerId: string;
  countryId: string;
  flags: CustomerWriteFlagGate;
  port?: ProductionFirestoreWritePort;
  displayNameHint?: string;
};

export type EnsureCustomerQaFixtureResult = {
  customerId: string;
  countryId: string;
  created: boolean;
  operationalState: "enabled";
  preconditionToken: string;
};

function countryPath(countryId: string): string {
  return `countries/${countryId}`;
}

export async function ensureCustomerQaFixture(
  input: EnsureCustomerQaFixtureInput,
): Promise<EnsureCustomerQaFixtureResult> {
  assertCustomerProductionWriteEnabled(input.flags);
  const customerId = String(input.customerId || "").trim();
  const countryId = String(input.countryId || "").trim();
  if (!customerId || !isExplicitQaId(customerId)) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "QA customer fixture id must use test_/qa_/demo_/golden_/cp5_ prefix",
    );
  }
  if (!countryId) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "countryId required for QA customer fixture",
    );
  }

  const port = input.port ?? createWifWritePortOrThrow("ops_writer");
  const existing = await port.getDocument("user", customerId);
  if (existing.exists && existing.data) {
    // Refuse to overwrite non-QA or contaminating docs.
    const d = existing.data;
    if (d.ismndob === true || d.ismndom === true || d.Isagent === true || d.isagent === true) {
      throw new CustomerWriteError(
        "NOT_OPERATIONAL_CUSTOMER",
        "Refusing to reuse Driver/Agent persona as Customer fixture",
      );
    }
    const qa =
      d.is_test === true ||
      d.functional_test === true ||
      d.qa_fixture === true ||
      d.synthetic === true;
    if (!qa && !isExplicitQaId(customerId)) {
      throw new CustomerWriteError(
        "VALIDATION_FAILED",
        "Existing user is not a QA fixture",
      );
    }
    return {
      customerId,
      countryId,
      created: false,
      operationalState: "enabled",
      preconditionToken: existing.updateTime
        ? `fs_ut_${existing.updateTime}`
        : `fs_exists_${customerId.slice(0, 8)}`,
    };
  }

  const fields = {
    ...qaFirestoreMarkers(),
    uid: customerId,
    actev_user: true,
    account_status: "enabled",
    accountEnabled: "enabled",
    blocked: false,
    email: `${customerId}@touri-taxi-test.invalid`,
    display_name:
      input.displayNameHint?.trim() ||
      `Admin Next QA Customer ${customerId.slice(-8)}`,
    created_time: new Date().toISOString(),
    Rev_dolh: { path: countryPath(countryId) },
    IsAdmin: false,
    isAdmin: false,
    isAdminRule: 0,
    IsAdminRule: 0,
    ismndob: false,
    ismndom: false,
    Isagent: false,
    isagent: false,
  };

  const created = await port.createDocument("user", customerId, fields);
  return {
    customerId,
    countryId,
    created: true,
    operationalState: "enabled",
    preconditionToken: created.updateTime
      ? `fs_ut_${created.updateTime}`
      : `fs_new_${customerId.slice(0, 8)}`,
  };
}
