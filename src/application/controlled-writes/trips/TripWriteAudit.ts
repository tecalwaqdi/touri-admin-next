import type { CancelTripCommand } from "@/application/controlled-writes/trips/TripWriteTypes";

export type TripWriteAuditRecord = {
  id: string;
  kind: "intent" | "result";
  action: "cancel";
  tripId: string;
  actorUid: string;
  correlationId: string;
  createdAtUtc: string;
  ok?: boolean;
  code?: string;
};

export type TripWriteAuditPort = {
  recordIntent(command: CancelTripCommand): Promise<string>;
  recordResult(input: {
    command: CancelTripCommand;
    intentId: string;
    ok: boolean;
    code?: string;
  }): Promise<string>;
};

export class InMemoryTripWriteAuditPort implements TripWriteAuditPort {
  readonly records: TripWriteAuditRecord[] = [];
  private seq = 0;

  async recordIntent(command: CancelTripCommand): Promise<string> {
    const id = `trip_intent_${++this.seq}`;
    this.records.push({
      id,
      kind: "intent",
      action: "cancel",
      tripId: command.tripId,
      actorUid: command.actor.uid,
      correlationId: command.correlationId,
      createdAtUtc: new Date().toISOString(),
    });
    return id;
  }

  async recordResult(input: {
    command: CancelTripCommand;
    intentId: string;
    ok: boolean;
    code?: string;
  }): Promise<string> {
    const id = `trip_result_${++this.seq}`;
    this.records.push({
      id,
      kind: "result",
      action: "cancel",
      tripId: input.command.tripId,
      actorUid: input.command.actor.uid,
      correlationId: input.command.correlationId,
      createdAtUtc: new Date().toISOString(),
      ok: input.ok,
      code: input.code,
    });
    return id;
  }
}
