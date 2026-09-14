import { describe, expect, it } from "vitest";
import { settlementStateMachine } from "@/domain/settlement/SettlementStateMachine";
import { IllegalSettlementTransitionError } from "@/domain/settlement/SettlementStateMachine";

describe("SettlementStateMachine", () => {
  it("allows draft → under_review → approved → closed → reversed", () => {
    expect(settlementStateMachine.canTransition("draft", "under_review")).toBe(true);
    expect(settlementStateMachine.canTransition("under_review", "approved")).toBe(true);
    expect(settlementStateMachine.canTransition("approved", "closed")).toBe(true);
    expect(settlementStateMachine.canTransition("closed", "reversed")).toBe(true);
  });

  it("rejects illegal transitions like draft → closed", () => {
    expect(settlementStateMachine.canTransition("draft", "closed")).toBe(false);
    expect(() => settlementStateMachine.assertTransition("draft", "closed")).toThrow(
      IllegalSettlementTransitionError,
    );
  });
});
