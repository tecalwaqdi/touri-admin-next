import type { ReconciliationRun } from "@/domain/reconciliation/ReconciliationRun";
import type { ReconciliationRepository } from "@/repositories/interfaces/ReconciliationRepository";

export class FakeReconciliationRepository implements ReconciliationRepository {
  private readonly byId = new Map<string, ReconciliationRun>();
  private readonly byIdempotency = new Map<string, string>();

  async save(run: ReconciliationRun): Promise<void> {
    this.byId.set(run.id, structuredClone(run));
    this.byIdempotency.set(run.idempotencyKey, run.id);
  }

  async get(id: string): Promise<ReconciliationRun | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<ReconciliationRun | null> {
    const id = this.byIdempotency.get(key);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }
}
