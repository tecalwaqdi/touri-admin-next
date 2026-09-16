import { describe, it, expect } from "vitest";
import { assertAuditPayloadHasNoRawPii } from "@/application/controlled-writes/ControlledWriteAudit";

describe("audit contact detection", () => {
  it("does not combine opaque identifiers with timestamps into invented contact data", () => {
    expect(assertAuditPayloadHasNoRawPii({ auditId: "cwi_tel42abc", timestamp: "2026-09-17T12:00:00.000Z" }).ok).toBe(true);
  });
  it.each([
    { note: "mobile +966 555 555 555" },
    { before: { note: "tel 1234567890" } },
    { before: { email: "redacted" } },
    { note: "operator@example.com" },
    { phone: "redacted" },
  ])("rejects contact data in %j", payload => {
    expect(assertAuditPayloadHasNoRawPii(payload).ok).toBe(false);
  });
});
