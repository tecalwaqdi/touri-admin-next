/**
 * Push delivery adapters — Fake never hits Production FCM.
 * Client-supplied FCM tokens are forbidden at the command boundary.
 */

export type ResolvedNotificationRecipient = {
  userId: string;
  /** Server-resolved only — never from client request body. */
  fcmTokens: string[];
};

export type PushDeliveryRequest = {
  title: string;
  body: string;
  recipients: ResolvedNotificationRecipient[];
  correlationId: string;
  idempotencyKey: string;
};

export type PushDeliveryResult = {
  attempted: boolean;
  realPushSent: false;
  deliveredCount: number;
  adapter: "fake" | "disabled";
};

export type PushDeliveryAdapter = {
  deliver(request: PushDeliveryRequest): Promise<PushDeliveryResult>;
};

/** Unit/pilot Fake — records calls, never sends. */
export class FakePushDeliveryAdapter implements PushDeliveryAdapter {
  readonly calls: PushDeliveryRequest[] = [];

  async deliver(request: PushDeliveryRequest): Promise<PushDeliveryResult> {
    this.calls.push(request);
    return {
      attempted: true,
      realPushSent: false,
      deliveredCount: request.recipients.length,
      adapter: "fake",
    };
  }
}

export class DisabledPushDeliveryAdapter implements PushDeliveryAdapter {
  async deliver(): Promise<PushDeliveryResult> {
    return {
      attempted: false,
      realPushSent: false,
      deliveredCount: 0,
      adapter: "disabled",
    };
  }
}

/** Reject any command-shaped object that smuggles fcmTokens from the client. */
export function assertNoClientFcmTokens(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const o = body as Record<string, unknown>;
  const forbiddenKeys = ["fcmToken", "fcm_token", "fcmTokens", "fcm_tokens", "tokens"];
  for (const k of forbiddenKeys) {
    if (k in o) {
      throw Object.assign(
        new Error("Client-supplied FCM tokens are forbidden"),
        { code: "ARBITRARY_FCM_TOKEN_FORBIDDEN" as const },
      );
    }
  }
  if (o.compose && typeof o.compose === "object") {
    assertNoClientFcmTokens(o.compose);
  }
  if (o.audience && typeof o.audience === "object") {
    assertNoClientFcmTokens(o.audience);
  }
}
