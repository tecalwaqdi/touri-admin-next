import type { Settlement } from "@/domain/settlement/Settlement";
import type { PaginatedResult } from "@/types/common";
import type {
  SettlementListParams,
  SettlementRepository,
} from "@/repositories/interfaces/SettlementRepository";
import { paginate } from "@/repositories/in-memory/paginate";
import { seedSettlements } from "@/test/fixtures/seed";

export class InMemorySettlementRepository implements SettlementRepository {
  private settlements: Settlement[];

  constructor(initial: Settlement[] = seedSettlements.map((s) => structuredClone(s))) {
    this.settlements = initial;
  }

  async list(params: SettlementListParams = {}): Promise<PaginatedResult<Settlement>> {
    let filtered = [...this.settlements];
    if (params.status) filtered = filtered.filter((s) => s.status === params.status);
    if (params.countryId) filtered = filtered.filter((s) => s.countryId === params.countryId);
    if (params.partyType) filtered = filtered.filter((s) => s.partyType === params.partyType);
    if (params.partyId) filtered = filtered.filter((s) => s.partyId === params.partyId);
    if (params.currencyCode) {
      filtered = filtered.filter(
        (s) => s.currencyCode.toUpperCase() === params.currencyCode!.toUpperCase(),
      );
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.partyId.toLowerCase().includes(q),
      );
    }
    const sort = params.sort ?? "createdAtUtc";
    const dir = params.sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = String(a[sort] ?? "");
      const bv = String(b[sort] ?? "");
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return paginate(filtered, params.page, params.pageSize);
  }

  async getById(id: string) {
    return this.settlements.find((s) => s.id === id) ?? null;
  }

  async save(settlement: Settlement) {
    const idx = this.settlements.findIndex((s) => s.id === settlement.id);
    if (idx >= 0) this.settlements[idx] = settlement;
    else this.settlements.unshift(settlement);
    return settlement;
  }

  async findClosedContainingTrip(tripId: string) {
    return (
      this.settlements.find(
        (s) => s.status === "closed" && s.tripIds.includes(tripId),
      ) ?? null
    );
  }

  async findByIdempotencyKey(key: string) {
    return this.settlements.find((s) => s.idempotencyKey === key) ?? null;
  }
}
