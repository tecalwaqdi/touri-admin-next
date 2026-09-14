/**
 * Phase 5C — Customer Controlled Write command constructors.
 */

import type {
  BlockCustomerCommand,
  CustomerBlockReasonCode,
  CustomerDisableReasonCode,
  CustomerReactivateReasonCode,
  DisableCustomerCommand,
  ProvenCustomerOperationalState,
  ReactivateCustomerCommand,
  VerifiedCustomerWriteActor,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";

type BaseInput = {
  actor: VerifiedCustomerWriteActor;
  customerId: string;
  expectedCurrentState: ProvenCustomerOperationalState;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
};

export function createDisableCustomerCommand(
  input: BaseInput & {
    reasonCode: CustomerDisableReasonCode;
    note?: string;
  },
): DisableCustomerCommand {
  return {
    ...input,
    action: "disable",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

export function createBlockCustomerCommand(
  input: BaseInput & {
    reasonCode: CustomerBlockReasonCode;
    note?: string;
  },
): BlockCustomerCommand {
  return {
    ...input,
    action: "block",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

export function createReactivateCustomerCommand(
  input: BaseInput & {
    reasonCode?: CustomerReactivateReasonCode;
    note?: string;
  },
): ReactivateCustomerCommand {
  return {
    ...input,
    action: "reactivate",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

/** Aliases matching command type names for call-site readability. */
export {
  createDisableCustomerCommand as disableCustomer,
  createBlockCustomerCommand as blockCustomer,
  createReactivateCustomerCommand as reactivateCustomer,
};
