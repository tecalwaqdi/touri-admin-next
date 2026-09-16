export type SupportWriteApplyResult = {
  applied: boolean;
  patchKeys: string[];
};

export type SupportWriteRepository = {
  applyPatch(input: {
    ticketId: string;
    patch: Record<string, unknown>;
    preconditionToken: string;
  }): Promise<SupportWriteApplyResult>;
};

/** Offline / unit Fake — never touches Production. */
export class FakeSupportWriteRepository implements SupportWriteRepository {
  readonly docs = new Map<
    string,
    { data: Record<string, unknown>; token: string }
  >;

  seed(ticketId: string, data: Record<string, unknown>, token = "t0") {
    this.docs.set(ticketId, { data: { ...data }, token });
  }

  async applyPatch(input: {
    ticketId: string;
    patch: Record<string, unknown>;
    preconditionToken: string;
  }): Promise<SupportWriteApplyResult> {
    const cur = this.docs.get(input.ticketId);
    if (!cur) throw new Error("SUPPORT_NOT_FOUND");
    if (cur.token !== input.preconditionToken) {
      throw Object.assign(new Error("PRECONDITION_FAILED"), {
        code: "PRECONDITION_FAILED",
      });
    }
    cur.data = { ...cur.data, ...input.patch };
    cur.token = `t${Date.now()}`;
    return { applied: true, patchKeys: Object.keys(input.patch) };
  }
}
