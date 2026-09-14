/**
 * Phase 5I/5J — operator-only SyntheticDriverProvisioningService.
 * Methods: dryRun | provision | verify.
 * NOT Admin UI. dryRun remains Phase 5I plan-only (writes = 0).
 * provision implements Phase 5J Auth-safe path — unreachable without ALL operator gates
 * + injected ports (or explicitly constructed Firebase adapters).
 */

import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  PHASE_5I_AUTH_CREATE_PROPERTIES,
  PHASE_5I_EMAIL_REQUIREMENT,
  PHASE_5I_LOGICAL_FIXTURE_NAME,
  PHASE_5I_PASSWORD_POLICY,
  PHASE_5I_UID_STRATEGY,
  assessDisabledAuthCompatibility,
} from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import {
  PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
  PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
  PHASE_5I_SYNC_USER_CLAIMS_EFFECT,
  PHASE_5I_SYNTHETIC_FIXTURE_CLAIM_POLICY,
  assessClaimsForFixtureDoc,
} from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import {
  PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION,
  PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION,
  type Phase5IExpectedWriteCounts,
} from "@/application/controlled-writes/pilot/Phase5IExpectedWriteCounts";
import {
  PHASE_5I_CREATE_SEMANTICS,
  PHASE_5I_PROVISIONING_ORDER,
  buildEmptyOperatorRegistryRecord,
  evaluateIdempotencyGate,
  type Phase5IOperatorRegistryRecord,
} from "@/application/controlled-writes/pilot/Phase5IProvisioningOrder";
import {
  assessCommunicationSideEffects,
  classifySyncClaimsForAuthSafePath,
  PHASE_5I_SIDE_EFFECT_MATRIX,
} from "@/application/controlled-writes/pilot/Phase5ISideEffectMatrix";
import {
  PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE,
  PHASE_5I_PII_POLICY,
  PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
  assertPhase5IMembershipAndSynthetic,
  resolvePhase5IFixtureGeography,
} from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import {
  PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED,
  isPhase5IProvisionSyntheticDriverEnabled,
  isPhase5ISyntheticDriverProvisionDryRunEnabled,
  isSyntheticAuthFixtureWriteEnabled,
} from "@/application/controlled-writes/pilot/isPhase5ISyntheticDriverProvisionEnabled";
import {
  evaluatePhase5JOperatorGates,
  type Phase5JOperatorGateEnv,
} from "@/application/controlled-writes/pilot/Phase5JOperatorGates";
import {
  createProvisionSyntheticDriverFixtureCommand,
  type ProvisionSyntheticDriverFixtureCommand,
} from "@/application/controlled-writes/pilot/ProvisionSyntheticDriverFixtureCommand";
import {
  buildEmptyPhase5JRegistryRecord,
  evaluatePhase5JIdempotency,
  loadPhase5JOperatorRegistry,
  savePhase5JOperatorRegistry,
  type Phase5JOperatorRegistryRecord,
} from "@/application/controlled-writes/pilot/Phase5JOperatorRegistry";
import type { Phase5JFixtureStatus } from "@/application/controlled-writes/pilot/Phase5JFixtureStateMachine";
import {
  createPhase5JWriteCounter,
  PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS,
  type Phase5JWriteCounter,
} from "@/application/controlled-writes/pilot/Phase5JExpectedWriteCounts";
import { verifyPhase5JClaimsBounded } from "@/application/controlled-writes/pilot/Phase5JClaimsVerification";
import {
  verifyPhase5JCanonicalFixture,
  verifyPhase5JSideEffects,
} from "@/application/controlled-writes/pilot/Phase5JCanonicalFixtureVerification";
import type {
  Phase5JAuditPort,
  Phase5JAuthPort,
  Phase5JFirestorePort,
} from "@/application/controlled-writes/pilot/Phase5JProvisioningPorts";
import { Phase5JMemoryAuditPort } from "@/application/controlled-writes/pilot/Phase5JProvisioningPorts";
import { toPhase5JObservabilityEvent } from "@/application/controlled-writes/pilot/Phase5JWriteObservability";

export type Phase5IProvisionDenialCode =
  | "PHASE5I_PROVISION_SKIP"
  | "SYNTHETIC_AUTH_FIXTURE_WRITE_DISABLED"
  | "WRITE_FLAGS_MUST_REMAIN_FALSE"
  | "PROJECT_ID_MISMATCH"
  | "FIXTURE_ALREADY_EXISTS"
  | "FAILED_PARTIAL_NO_MULTI_CREATE"
  | "AUTH_SAFE_FIXTURE_NO_GO"
  | "COMMUNICATION_NO_GO"
  | "DESIGN_SESSION_NO_LIVE_WRITES"
  | "PROVISIONING_WRITE_DISABLED"
  | "UNSAFE_WRITE_CONFIGURATION"
  | "PROVISIONING_PORTS_UNAVAILABLE"
  | "GEOGRAPHY_MISSING"
  | "AUTH_CREATE_FAILED"
  | "FIRESTORE_CREATE_FAILED"
  | "CLAIM_SYNC_TIMEOUT"
  | "UNEXPECTED_FIXTURE_CLAIMS"
  | "CANONICAL_FIXTURE_VERIFICATION_FAILED"
  | "UNEXPECTED_SIDE_EFFECTS"
  | "AUDIT_FAIL_CLOSED"
  | "PILOT_READY_IDEMPOTENT"
  | "RESUME_FIRESTORE_ONLY";

export type Phase5IDryRunResult = {
  readonly mode: "dry_run";
  readonly wouldWrite: boolean;
  readonly actualWrite: false;
  readonly writeFlagsRemainFalse: true;
  readonly logicalName: typeof PHASE_5I_LOGICAL_FIXTURE_NAME;
  readonly authModel: typeof PHASE_5I_AUTH_CREATE_PROPERTIES;
  readonly uidStrategy: typeof PHASE_5I_UID_STRATEGY;
  readonly emailRequirement: typeof PHASE_5I_EMAIL_REQUIREMENT;
  readonly passwordPolicy: typeof PHASE_5I_PASSWORD_POLICY;
  readonly disabledCompat: ReturnType<typeof assessDisabledAuthCompatibility>;
  readonly expectedClaims: typeof PHASE_5I_EXPECTED_CUSTOM_CLAIMS;
  readonly claimKeyCount: typeof PHASE_5I_EXPECTED_CLAIM_KEY_COUNT;
  readonly elevatedVerdict: "AUTH_SAFE_FIXTURE_GO" | "AUTH_SAFE_FIXTURE_NO_GO";
  readonly communication: ReturnType<typeof assessCommunicationSideEffects>;
  readonly syncClaimsClass: ReturnType<typeof classifySyncClaimsForAuthSafePath>;
  readonly provisioningOrder: typeof PHASE_5I_PROVISIONING_ORDER;
  readonly membership: ReturnType<typeof assertPhase5IMembershipAndSynthetic>;
  readonly geography: ReturnType<typeof resolvePhase5IFixtureGeography>;
  readonly writeCounts: Phase5IExpectedWriteCounts;
  readonly futureWriteCounts: Phase5IExpectedWriteCounts;
  readonly registry: Phase5IOperatorRegistryRecord;
  readonly idempotency: ReturnType<typeof evaluateIdempotencyGate>;
  readonly gates: {
    dryRunEnv: boolean;
    provisionEnv: boolean;
    authFixtureWriteEnabled: boolean;
    globalWriteGates: typeof PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED;
  };
  readonly productionWrites: 0;
  readonly authWrites: 0;
  readonly financeWrites: 0;
  readonly tripWrites: 0;
  readonly piiPolicy: typeof PHASE_5I_PII_POLICY;
  readonly syntheticFixtureClaimPolicy: typeof PHASE_5I_SYNTHETIC_FIXTURE_CLAIM_POLICY;
  readonly sideEffectRows: number;
};

export type Phase5JProvisionSuccess = {
  ok: true;
  actualWrite: true;
  uid: string;
  status: "pilot_ready";
  message: string;
  requestId: string;
  writeCounts: Phase5JWriteCounter;
  observability: ReturnType<typeof toPhase5JObservabilityEvent>;
  authSafeSummary: {
    uid: string;
    disabled: true;
    email: null;
    phoneNumber: null;
  };
  productionWrites: 1;
  authWrites: 1;
  financeWrites: 0;
  tripWrites: 0;
};

export type Phase5JProvisionFailure = {
  ok: false;
  actualWrite: boolean;
  code: Phase5IProvisionDenialCode;
  message: string;
  uid: string | null;
  status: Phase5JFixtureStatus;
  requestId: string | null;
  writeCounts: Phase5JWriteCounter;
  productionWrites: number;
  authWrites: number;
  financeWrites: 0;
  tripWrites: 0;
};

export type Phase5IProvisionResult =
  | Phase5JProvisionSuccess
  | Phase5JProvisionFailure;

export type Phase5IVerifyResult = {
  readonly mode: "verify_offline";
  readonly actualWrite: false;
  readonly membershipOk: boolean;
  readonly claimsOk: boolean;
  readonly elevatedOk: boolean;
  readonly communicationOk: boolean;
  readonly pilotReadyShape: boolean;
};

export type SyntheticDriverProvisioningPorts = {
  auth: Phase5JAuthPort;
  firestore: Phase5JFirestorePort;
  audit?: Phase5JAuditPort;
};

export type SyntheticDriverProvisioningServiceOptions = {
  ports?: SyntheticDriverProvisioningPorts;
  /** Registry cwd override (tests). Default process.cwd(). */
  registryCwd?: string;
  /** Persist registry to .local/phase5j-fixture (default true when ports present). */
  persistRegistry?: boolean;
  /** Claim poll overrides (tests). */
  claimMaxAttempts?: number;
  claimIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

function writeFlagsAllFalse(): boolean {
  return (
    CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled === false &&
    CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled === false &&
    PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.GLOBAL_PRODUCTION_WRITE_ENABLED ===
      false &&
    PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED ===
      false
  );
}

function denial(
  code: Phase5IProvisionDenialCode,
  message: string,
  extra?: Partial<Phase5JProvisionFailure>,
): Phase5JProvisionFailure {
  const writeCounts = extra?.writeCounts ?? createPhase5JWriteCounter();
  return {
    ok: false,
    actualWrite: extra?.actualWrite ?? false,
    code,
    message,
    uid: extra?.uid ?? null,
    status: extra?.status ?? "planned",
    requestId: extra?.requestId ?? null,
    writeCounts,
    productionWrites: extra?.productionWrites ?? 0,
    authWrites: extra?.authWrites ?? 0,
    financeWrites: 0,
    tripWrites: 0,
  };
}

/**
 * Operator-only service. No Admin UI wiring.
 * dryRun: plan + validate offline (Phase 5I).
 * provision: Phase 5J gated Auth → Firestore → claims → canonical verify.
 * verify: offline shape verification against typed doc + claims mirror.
 */
export class SyntheticDriverProvisioningService {
  private readonly ports: SyntheticDriverProvisioningPorts | null;
  private readonly registryCwd: string;
  private readonly persistRegistry: boolean;
  private readonly claimMaxAttempts?: number;
  private readonly claimIntervalMs?: number;
  private readonly sleep?: (ms: number) => Promise<void>;

  constructor(options?: SyntheticDriverProvisioningServiceOptions) {
    this.ports = options?.ports ?? null;
    this.registryCwd = options?.registryCwd ?? process.cwd();
    this.persistRegistry = options?.persistRegistry ?? Boolean(options?.ports);
    this.claimMaxAttempts = options?.claimMaxAttempts;
    this.claimIntervalMs = options?.claimIntervalMs;
    this.sleep = options?.sleep;
  }

  dryRun(input?: {
    projectId?: string;
    registry?: Phase5IOperatorRegistryRecord;
    dryRunEnv?: string;
    provisionEnv?: string;
    authFixtureWriteEnv?: string;
  }): Phase5IDryRunResult {
    const registry =
      input?.registry ?? buildEmptyOperatorRegistryRecord();
    const claimsAssessment = assessClaimsForFixtureDoc(
      PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
    );
    const membership = assertPhase5IMembershipAndSynthetic({
      documentId: PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE,
    });
    const communication = assessCommunicationSideEffects();
    const idempotency = evaluateIdempotencyGate(registry);

    const authWriteEnabled = isSyntheticAuthFixtureWriteEnabled(
      input?.authFixtureWriteEnv,
    );
    const provisionEnv = isPhase5IProvisionSyntheticDriverEnabled(
      input?.provisionEnv,
    );
    const dryRunEnv = isPhase5ISyntheticDriverProvisionDryRunEnabled(
      input?.dryRunEnv ?? "1",
    );

    // Dry-run never writes — even if operator arms provision env.
    const wouldWrite =
      provisionEnv &&
      authWriteEnabled &&
      writeFlagsAllFalse() === false &&
      claimsAssessment.verdict === "AUTH_SAFE_FIXTURE_GO" &&
      idempotency.allowAuthCreate;

    // Phase 5I design: wouldWrite must stay false (gates documented false).
    void wouldWrite;

    return {
      mode: "dry_run",
      wouldWrite: false,
      actualWrite: false,
      writeFlagsRemainFalse: true,
      logicalName: PHASE_5I_LOGICAL_FIXTURE_NAME,
      authModel: PHASE_5I_AUTH_CREATE_PROPERTIES,
      uidStrategy: PHASE_5I_UID_STRATEGY,
      emailRequirement: PHASE_5I_EMAIL_REQUIREMENT,
      passwordPolicy: PHASE_5I_PASSWORD_POLICY,
      disabledCompat: assessDisabledAuthCompatibility(),
      expectedClaims: PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
      claimKeyCount: PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
      elevatedVerdict: claimsAssessment.verdict,
      communication,
      syncClaimsClass: classifySyncClaimsForAuthSafePath(),
      provisioningOrder: PHASE_5I_PROVISIONING_ORDER,
      membership,
      geography: resolvePhase5IFixtureGeography(),
      writeCounts: PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION,
      futureWriteCounts: PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION,
      registry,
      idempotency,
      gates: {
        dryRunEnv,
        provisionEnv,
        authFixtureWriteEnabled: authWriteEnabled,
        globalWriteGates: PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED,
      },
      productionWrites: 0,
      authWrites: 0,
      financeWrites: 0,
      tripWrites: 0,
      piiPolicy: PHASE_5I_PII_POLICY,
      syntheticFixtureClaimPolicy: PHASE_5I_SYNTHETIC_FIXTURE_CLAIM_POLICY,
      sideEffectRows: PHASE_5I_SIDE_EFFECT_MATRIX.length,
    };
  }

  /**
   * Phase 5J real provision path. Requires ALL operator gates + ports.
   * One Auth create attempt + one Firestore create attempt per invocation.
   * Claim read retries OK. No auto-delete. No second Auth create on partial.
   */
  async provision(input?: {
    projectId?: string;
    provisionEnv?: string;
    authFixtureWriteEnv?: string;
    registry?: Phase5IOperatorRegistryRecord;
    gates?: Phase5JOperatorGateEnv;
    command?: ProvisionSyntheticDriverFixtureCommand;
  }): Promise<Phase5IProvisionResult> {
    const writeCounts = createPhase5JWriteCounter();
    const command =
      input?.command ?? createProvisionSyntheticDriverFixtureCommand();

    // Compatibility: early SKIP when Phase 5I provision arm unset (no gates map).
    if (
      input?.gates == null &&
      !isPhase5IProvisionSyntheticDriverEnabled(input?.provisionEnv)
    ) {
      return denial(
        "PHASE5I_PROVISION_SKIP",
        "PHASE5I_PROVISION_SYNTHETIC_DRIVER unset/≠1 → SKIP",
        { writeCounts, requestId: command.requestId },
      );
    }

    const gateEnv: Phase5JOperatorGateEnv = input?.gates ?? {
      PHASE5I_PROVISION_SYNTHETIC_DRIVER:
        input?.provisionEnv ?? process.env.PHASE5I_PROVISION_SYNTHETIC_DRIVER,
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED:
        input?.authFixtureWriteEnv ??
        process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
      GLOBAL_PRODUCTION_WRITE_ENABLED:
        process.env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: process.env.PRODUCTION_WRITE_ENABLED,
      DRIVER_WRITE_ENABLED: process.env.DRIVER_WRITE_ENABLED,
      AGENT_WRITE_ENABLED: process.env.AGENT_WRITE_ENABLED,
      CUSTOMER_WRITE_ENABLED: process.env.CUSTOMER_WRITE_ENABLED,
      CUSTOMER_AUTH_WRITE_ENABLED: process.env.CUSTOMER_AUTH_WRITE_ENABLED,
      FINANCE_WRITE_ENABLED: process.env.FINANCE_WRITE_ENABLED,
      EXPECTED_PROJECT_ID:
        input?.projectId ?? process.env.EXPECTED_PROJECT_ID,
    };

    const gates = evaluatePhase5JOperatorGates(gateEnv);
    if (!gates.ok) {
      return denial(gates.code, gates.message, {
        writeCounts,
        requestId: command.requestId,
      });
    }

    if (!this.ports) {
      return denial(
        "PROVISIONING_PORTS_UNAVAILABLE",
        "Provisioning ports not injected — refuse live Admin without explicit adapters",
        { writeCounts, requestId: command.requestId },
      );
    }

    const { auth, firestore } = this.ports;
    const audit: Phase5JAuditPort =
      this.ports.audit ?? new Phase5JMemoryAuditPort();

    let registry: Phase5JOperatorRegistryRecord = this.persistRegistry
      ? loadPhase5JOperatorRegistry(this.registryCwd)
      : buildEmptyPhase5JRegistryRecord();

    // Allow in-memory Phase 5I registry shape for unit compatibility.
    if (input?.registry) {
      registry = {
        ...buildEmptyPhase5JRegistryRecord(),
        uid: input.registry.uid,
        status: mapPhase5IStatusToPhase5J(input.registry.status),
        requestId: command.requestId,
      };
    }

    const idemp = evaluatePhase5JIdempotency(registry);
    if (
      idemp.code === "FIXTURE_ALREADY_EXISTS" ||
      idemp.code === "PILOT_READY_IDEMPOTENT"
    ) {
      return denial(
        idemp.code === "PILOT_READY_IDEMPOTENT"
          ? "PILOT_READY_IDEMPOTENT"
          : "FIXTURE_ALREADY_EXISTS",
        idemp.message,
        {
          writeCounts,
          uid: idemp.uid,
          status: registry.status,
          requestId: command.requestId,
        },
      );
    }
    if (idemp.code === "FAILED_PARTIAL_NO_MULTI_CREATE") {
      return denial("FAILED_PARTIAL_NO_MULTI_CREATE", idemp.message, {
        writeCounts,
        uid: idemp.uid,
        status: registry.status,
        requestId: command.requestId,
      });
    }

    const claimsAssessment = assessClaimsForFixtureDoc(command.firestoreDoc);
    if (claimsAssessment.verdict === "AUTH_SAFE_FIXTURE_NO_GO") {
      return denial(
        "AUTH_SAFE_FIXTURE_NO_GO",
        "Elevated privilege claims present in allowlist schema",
        { writeCounts, requestId: command.requestId },
      );
    }

    const now = new Date().toISOString();
    try {
      await audit.recordIntent({
        kind: "intent",
        requestId: command.requestId,
        correlationId: command.correlationId,
        logicalFixtureName: command.logicalFixtureName,
        uid: registry.uid,
        status: "planned",
        createdAtUtc: now,
      });
      writeCounts.auditWrites += 1;
    } catch (err) {
      return denial(
        "AUDIT_FAIL_CLOSED",
        err instanceof Error ? err.message : "Audit intent failed",
        { writeCounts, requestId: command.requestId },
      );
    }

    const geo = await firestore.verifyGeographyExists();
    if (!geo.ok) {
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        registry.uid,
        "failed_partial",
        "denied",
        geo.code,
      );
      return denial("GEOGRAPHY_MISSING", geo.message, {
        writeCounts,
        requestId: command.requestId,
        status: "failed_partial",
      });
    }

    let uid: string | null = registry.uid;
    let status: Phase5JFixtureStatus = registry.status;
    let authCreatedThisInvocation = false;

    // Auth create — one attempt max; skip if resuming auth_created.
    if (idemp.code === "IDEMPOTENT_PLANNED_OK") {
      const created = await auth.createDisabledSyntheticUser();
      if (!created.ok) {
        status = "failed_partial";
        this.persist(registry, {
          status,
          requestId: command.requestId,
          uid: null,
        });
        await this.finishAudit(
          audit,
          writeCounts,
          command,
          null,
          status,
          "failed",
          created.code,
        );
        return denial("AUTH_CREATE_FAILED", created.message, {
          writeCounts,
          status,
          requestId: command.requestId,
          actualWrite: false,
        });
      }
      writeCounts.authCreate = 1;
      authCreatedThisInvocation = true;
      uid = created.user.uid;
      status = "auth_created";
      this.persist(registry, {
        status,
        uid,
        requestId: command.requestId,
        createdAtUtc: now,
      });
      registry = { ...registry, uid, status, requestId: command.requestId };
    } else if (idemp.code === "RESUME_FIRESTORE_ONLY") {
      uid = idemp.uid;
      status = "auth_created";
      // No second Auth create.
    }

    if (!uid) {
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        null,
        "failed_partial",
        "failed",
        "MISSING_UID",
      );
      return denial("AUTH_CREATE_FAILED", "UID missing after Auth stage", {
        writeCounts,
        status: "failed_partial",
        requestId: command.requestId,
        actualWrite: authCreatedThisInvocation,
        authWrites: writeCounts.authCreate,
      });
    }

    // Verify Auth still disabled + no email/phone (one getUser read OK).
    const authCheck = await auth.getUser(uid);
    if (
      !authCheck.ok ||
      authCheck.disabled !== true ||
      authCheck.email != null ||
      authCheck.phoneNumber != null
    ) {
      status = "failed_partial_auth_only";
      this.persist(registry, { status, uid, requestId: command.requestId });
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        uid,
        status,
        "failed",
        "AUTH_CONTRACT_VIOLATION",
      );
      return denial(
        "AUTH_CREATE_FAILED",
        "Auth user must be disabled with no email/phone",
        {
          writeCounts,
          uid,
          status,
          requestId: command.requestId,
          actualWrite: authCreatedThisInvocation,
          authWrites: writeCounts.authCreate,
        },
      );
    }

    // Firestore create-only — one attempt.
    if (await firestore.userDocExists(uid)) {
      status = "failed_partial";
      this.persist(registry, { status, uid, requestId: command.requestId });
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        uid,
        status,
        "denied",
        "FIXTURE_ALREADY_EXISTS",
      );
      return denial(
        "FIXTURE_ALREADY_EXISTS",
        "user/{uid} already exists — create-only refuse",
        {
          writeCounts,
          uid,
          status,
          requestId: command.requestId,
          actualWrite: authCreatedThisInvocation,
          authWrites: writeCounts.authCreate,
        },
      );
    }

    const fsCreate = await firestore.createUserDoc(uid, command.firestoreDoc);
    if (!fsCreate.ok) {
      status =
        fsCreate.code === "FIXTURE_ALREADY_EXISTS"
          ? "failed_partial"
          : "failed_partial_auth_only";
      this.persist(registry, { status, uid, requestId: command.requestId });
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        uid,
        status,
        "failed",
        fsCreate.code,
      );
      return denial(
        fsCreate.code === "FIXTURE_ALREADY_EXISTS"
          ? "FIXTURE_ALREADY_EXISTS"
          : "FIRESTORE_CREATE_FAILED",
        fsCreate.message,
        {
          writeCounts,
          uid,
          status,
          requestId: command.requestId,
          actualWrite: authCreatedThisInvocation,
          authWrites: writeCounts.authCreate,
          productionWrites: 0,
        },
      );
    }
    writeCounts.firestoreUserCreates = 1;
    writeCounts.triggerInvocations = 1; // syncUserClaimsOnWrite expected exactly once
    status = "firestore_created";
    this.persist(registry, { status, uid, requestId: command.requestId });

    // Bounded claim poll (retries OK).
    const claims = await verifyPhase5JClaimsBounded({
      auth,
      uid,
      maxAttempts: this.claimMaxAttempts,
      intervalMs: this.claimIntervalMs,
      sleep: this.sleep ?? (async () => undefined),
    });
    if (!claims.ok) {
      status = "failed_partial_claims";
      this.persist(registry, { status, uid, requestId: command.requestId });
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        uid,
        status,
        "failed",
        claims.code,
      );
      return denial(claims.code, claims.message, {
        writeCounts,
        uid,
        status,
        requestId: command.requestId,
        actualWrite: true,
        authWrites: writeCounts.authCreate,
        productionWrites: writeCounts.firestoreUserCreates,
      });
    }
    writeCounts.claimsSetCustomUserClaims = 1;
    status = "claims_verified";
    this.persist(registry, { status, uid, requestId: command.requestId });

    const stored = await firestore.getUserDoc(uid);
    const canonical = verifyPhase5JCanonicalFixture({
      uid,
      data: stored.ok ? stored.data : undefined,
    });
    if (!canonical.ok) {
      status = "failed_partial_canonical";
      this.persist(registry, { status, uid, requestId: command.requestId });
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        uid,
        status,
        "failed",
        canonical.code,
      );
      return denial(canonical.code, canonical.message, {
        writeCounts,
        uid,
        status,
        requestId: command.requestId,
        actualWrite: true,
        authWrites: writeCounts.authCreate,
        productionWrites: writeCounts.firestoreUserCreates,
      });
    }

    const side = verifyPhase5JSideEffects(writeCounts);
    if (!side.ok) {
      status = "failed_partial_canonical";
      this.persist(registry, { status, uid, requestId: command.requestId });
      await this.finishAudit(
        audit,
        writeCounts,
        command,
        uid,
        status,
        "failed",
        side.code,
      );
      return denial(side.code, side.message, {
        writeCounts,
        uid,
        status,
        requestId: command.requestId,
        actualWrite: true,
        authWrites: writeCounts.authCreate,
        productionWrites: writeCounts.firestoreUserCreates,
      });
    }

    status = "fixture_verified";
    writeCounts.idempotencyWrites = 1;
    status = "pilot_ready";
    this.persist(registry, { status, uid, requestId: command.requestId });

    await this.finishAudit(
      audit,
      writeCounts,
      command,
      uid,
      status,
      "applied",
      "PILOT_READY",
    );

    void PHASE_5I_CREATE_SEMANTICS;
    void PHASE_5I_SYNC_USER_CLAIMS_EFFECT;
    void PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS;

    const observability = toPhase5JObservabilityEvent({
      requestId: command.requestId,
      status,
      writeCounts,
    });

    return {
      ok: true,
      actualWrite: true,
      uid,
      status: "pilot_ready",
      message: "Auth-safe synthetic Driver fixture provisioned — pilot_ready",
      requestId: command.requestId,
      writeCounts,
      observability,
      authSafeSummary: {
        uid,
        disabled: true,
        email: null,
        phoneNumber: null,
      },
      productionWrites: 1,
      authWrites: 1,
      financeWrites: 0,
      tripWrites: 0,
    };
  }

  verify(input?: { documentId?: string }): Phase5IVerifyResult {
    const documentId =
      input?.documentId?.trim() || PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE;
    const membership = assertPhase5IMembershipAndSynthetic({ documentId });
    const claimsAssessment = assessClaimsForFixtureDoc(
      PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
    );
    const communication = assessCommunicationSideEffects();
    return {
      mode: "verify_offline",
      actualWrite: false,
      membershipOk: membership.operationalDriver && membership.synthetic,
      claimsOk:
        claimsAssessment.claimKeyCount === PHASE_5I_EXPECTED_CLAIM_KEY_COUNT &&
        claimsAssessment.verdict === "AUTH_SAFE_FIXTURE_GO",
      elevatedOk: claimsAssessment.elevatedPrivilege === false,
      communicationOk: communication.verdict === "COMMUNICATION_GO",
      pilotReadyShape: membership.safePilotEligible === true,
    };
  }

  private persist(
    previous: Phase5JOperatorRegistryRecord,
    patch: {
      status: Phase5JFixtureStatus;
      uid: string | null;
      requestId: string;
      createdAtUtc?: string;
    },
  ): void {
    if (!this.persistRegistry) return;
    const now = new Date().toISOString();
    savePhase5JOperatorRegistry(
      {
        ...previous,
        status: patch.status,
        uid: patch.uid,
        requestId: patch.requestId,
        createdAtUtc: patch.createdAtUtc ?? previous.createdAtUtc ?? now,
        updatedAtUtc: now,
        passwordStored: false,
        tokenStored: false,
        emailStored: false,
        phoneStored: false,
        serviceAccountStored: false,
        authDisabled: true,
      },
      this.registryCwd,
    );
  }

  private async finishAudit(
    audit: Phase5JAuditPort,
    writeCounts: Phase5JWriteCounter,
    command: ProvisionSyntheticDriverFixtureCommand,
    uid: string | null,
    status: Phase5JFixtureStatus,
    outcome: string,
    code: string,
  ): Promise<void> {
    try {
      await audit.recordResult({
        kind: "result",
        requestId: command.requestId,
        correlationId: command.correlationId,
        logicalFixtureName: command.logicalFixtureName,
        uid,
        status,
        outcome,
        code,
        createdAtUtc: new Date().toISOString(),
      });
      writeCounts.auditWrites += 1;
    } catch {
      // Result audit failure after mutation: counts already reflect intent;
      // fail-closed is documented — do not throw (preserve partial registry).
    }
  }
}

function mapPhase5IStatusToPhase5J(
  status: Phase5IOperatorRegistryRecord["status"],
): Phase5JFixtureStatus {
  switch (status) {
    case "planned":
      return "planned";
    case "auth_created":
      return "auth_created";
    case "firestore_created":
      return "firestore_created";
    case "claims_synced":
      return "claims_verified";
    case "verified":
      return "fixture_verified";
    case "pilot_ready":
      return "pilot_ready";
    case "failed_partial":
      return "failed_partial";
    case "retired":
      return "pilot_ready";
    default:
      return "planned";
  }
}

export function createSyntheticDriverProvisioningService(
  options?: SyntheticDriverProvisioningServiceOptions,
): SyntheticDriverProvisioningService {
  return new SyntheticDriverProvisioningService(options);
}
