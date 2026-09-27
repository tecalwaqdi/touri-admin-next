import type {
  CancelTripCommand,
  TripWriteCanonicalResponse,
} from "@/application/controlled-writes/trips/TripWriteTypes";

export type TripWriteIdempotencyStore = {
  get(
    key: string,
  ): Promise<Extract<TripWriteCanonicalResponse, { ok: true }> | null>;
  put(
    key: string,
    response: Extract<TripWriteCanonicalResponse, { ok: true }>,
  ): Promise<void>;
};

export class InMemoryTripWriteIdempotencyStore
  implements TripWriteIdempotencyStore
{
  private readonly map = new Map<
    string,
    Extract<TripWriteCanonicalResponse, { ok: true }>
  >();

  async get(key: string) {
    return this.map.get(key) ?? null;
  }

  async put(
    key: string,
    response: Extract<TripWriteCanonicalResponse, { ok: true }>,
  ) {
    this.map.set(key, response);
  }
}

export function tripCancelIdempotencyFingerprint(
  command: CancelTripCommand,
): string {
  return [
    command.action,
    command.tripId,
    command.expectedLifecycleStatus,
    command.reasonCode,
    command.preconditionToken,
  ].join("|");
}
