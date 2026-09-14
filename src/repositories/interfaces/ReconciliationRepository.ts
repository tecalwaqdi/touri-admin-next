import type { ReconciliationRun } from "@/domain/reconciliation/ReconciliationRun";

export interface ReconciliationRepository {
  save(run: ReconciliationRun): Promise<void>;
  get(id: string): Promise<ReconciliationRun | null>;
  findByIdempotencyKey(key: string): Promise<ReconciliationRun | null>;
}
