/**
 * Phase 4 DESIGN — Disabled write repository.
 * Shadow container registers ONLY this for writes.
 * Any mutate attempt → PRODUCTION_WRITE_DISABLED.
 */

export class ProductionWriteDisabledError extends Error {
  readonly code = "PRODUCTION_WRITE_DISABLED";
  constructor(message = "Production writes are disabled (shadow / design)") {
    super(message);
    this.name = "ProductionWriteDisabledError";
  }
}

export type WriteAttempt = {
  resource: string;
  operation: string;
  actorUid?: string;
};

/**
 * Catch-all write port used by DI to ensure no Production write path exists.
 */
export class DisabledWriteRepository {
  readonly kind = "disabled_write" as const;

  async create(_attempt: WriteAttempt): Promise<never> {
    throw new ProductionWriteDisabledError();
  }

  async update(_attempt: WriteAttempt): Promise<never> {
    throw new ProductionWriteDisabledError();
  }

  async delete(_attempt: WriteAttempt): Promise<never> {
    throw new ProductionWriteDisabledError();
  }

  async execute(_attempt: WriteAttempt): Promise<never> {
    throw new ProductionWriteDisabledError();
  }
}

/** Settlement / ledger / mutation command ports — always disabled in shadow. */
export class DisabledSettlementCommandPort {
  async create(): Promise<never> {
    throw new ProductionWriteDisabledError("Settlement create disabled");
  }
  async approve(): Promise<never> {
    throw new ProductionWriteDisabledError("Settlement approve disabled");
  }
  async submit(): Promise<never> {
    throw new ProductionWriteDisabledError("Settlement submit disabled");
  }
  async reject(): Promise<never> {
    throw new ProductionWriteDisabledError("Settlement reject disabled");
  }
  async close(): Promise<never> {
    throw new ProductionWriteDisabledError("Settlement close disabled");
  }
  async reverse(): Promise<never> {
    throw new ProductionWriteDisabledError("Settlement reverse disabled");
  }
}

export class DisabledLedgerCommandPort {
  async post(): Promise<never> {
    throw new ProductionWriteDisabledError("Ledger posting disabled");
  }
}

export class DisabledDriverMutationPort {
  async approve(): Promise<never> {
    throw new ProductionWriteDisabledError("Driver approval disabled");
  }
}

export class DisabledAgentMutationPort {
  async activate(): Promise<never> {
    throw new ProductionWriteDisabledError("Agent activation disabled");
  }
  async reassign(): Promise<never> {
    throw new ProductionWriteDisabledError("Agent reassignment disabled");
  }
}
