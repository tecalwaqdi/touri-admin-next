/**
 * Phase 5I — offline unit contracts (§32):
 * Auth model / UID / disabled / email / password / claims / elevated /
 * Firestore schema / membership / role exclusion / communication /
 * side-effect matrix / provisioning order / partial failure / idempotency /
 * registry / write counts / gates / dryRun / provision refuse / verify /
 * write-flag guards / isolation.
 * Production writes = 0. No live Firebase. No Auth create.
 */
import { describe, expect, it } from "vitest";
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
  PHASE_5I_ELEVATED_CLAIM_KEYS,
  PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
  PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
  PHASE_5I_SYNC_USER_CLAIMS_EFFECT,
  PHASE_5I_SYNTHETIC_FIXTURE_CLAIM_POLICY,
  assessClaimsForFixtureDoc,
  assessElevatedPrivilegeForClaims,
  deriveExpectedCustomClaimsFromUserData,
} from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import {
  PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION,
  PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION,
} from "@/application/controlled-writes/pilot/Phase5IExpectedWriteCounts";
import {
  PHASE_5I_CREATE_SEMANTICS,
  PHASE_5I_FIXTURE_STATE_MACHINE,
  PHASE_5I_PARTIAL_FAILURE_HANDLING,
  PHASE_5I_PROVISIONING_ORDER,
  buildEmptyOperatorRegistryRecord,
  evaluateIdempotencyGate,
} from "@/application/controlled-writes/pilot/Phase5IProvisioningOrder";
import { runPhase5ISyntheticDriverProvisionDryRun } from "@/application/controlled-writes/pilot/Phase5IProvisionDryRun";
import {
  PHASE_5I_SIDE_EFFECT_MATRIX,
  assessCommunicationSideEffects,
  classifySyncClaimsForAuthSafePath,
} from "@/application/controlled-writes/pilot/Phase5ISideEffectMatrix";
import {
  PHASE_5I_FIXTURE_CITY_ID,
  PHASE_5I_FIXTURE_COUNTRY_ID,
  PHASE_5I_FIXTURE_FORBIDDEN_FIELDS,
  PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE,
  PHASE_5I_PII_POLICY,
  PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
  assertPhase5IMembershipAndSynthetic,
  resolvePhase5IFixtureGeography,
} from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import {
  createSyntheticDriverProvisioningService,
} from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import {
  PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED,
  isPhase5IProvisionSyntheticDriverEnabled,
  isPhase5ISyntheticDriverProvisionDryRunEnabled,
  isSyntheticAuthFixtureWriteEnabled,
} from "@/application/controlled-writes/pilot/isPhase5ISyntheticDriverProvisionEnabled";
import { classifyProvenSyntheticDriver } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";
import { classifyDriverMembership } from "@/domain/driver/DriverRoleClassification";

describe("Phase 5I — enablement / write flags", () => {
  it("1. write flags + documented global gates remain false", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(
      PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    ).toBe(false);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION).toEqual({
      authCreate: 0,
      firestoreUserCreates: 0,
      claimsSetCustomUserClaims: 0,
      auditWrites: 0,
      idempotencyWrites: 0,
      triggerInvocations: 0,
      financeWrites: 0,
      tripWrites: 0,
      agentWrites: 0,
      customerWrites: 0,
    });
  });

  it("2. harness env exact 1 only; separate from Pilot flags", () => {
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled(undefined)).toBe(
      false,
    );
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled("true")).toBe(false);
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled("1")).toBe(true);
    expect(isPhase5IProvisionSyntheticDriverEnabled("1")).toBe(true);
    expect(isSyntheticAuthFixtureWriteEnabled(undefined)).toBe(false);
    expect(isSyntheticAuthFixtureWriteEnabled("1")).toBe(true);
  });
});

describe("Phase 5I — Auth fixture model / UID / disabled", () => {
  it("3. Auth create prefers disabled=true; no email/phone/password/uid", () => {
    expect(PHASE_5I_AUTH_CREATE_PROPERTIES.disabled).toBe(true);
    expect(PHASE_5I_AUTH_CREATE_PROPERTIES.email).toBeUndefined();
    expect(PHASE_5I_AUTH_CREATE_PROPERTIES.phoneNumber).toBeUndefined();
    expect(PHASE_5I_AUTH_CREATE_PROPERTIES.password).toBeUndefined();
    expect(PHASE_5I_AUTH_CREATE_PROPERTIES.uid).toBeUndefined();
  });

  it("4. email optional on Admin SDK; createPanelUser path unused", () => {
    expect(PHASE_5I_EMAIL_REQUIREMENT.adminSdkCreateUserRequiresEmail).toBe(
      false,
    );
    expect(PHASE_5I_EMAIL_REQUIREMENT.legacyCreatePanelUserRequiresEmail).toBe(
      true,
    );
    expect(PHASE_5I_EMAIL_REQUIREMENT.phase5IUsesCreatePanelUser).toBe(false);
    expect(
      PHASE_5I_EMAIL_REQUIREMENT.reservedNonDeliverableEmailRequired,
    ).toBe(false);
  });

  it("5. password not preferred; never display/persist/login", () => {
    expect(PHASE_5I_PASSWORD_POLICY.passwordPreferred).toBe(false);
    expect(PHASE_5I_PASSWORD_POLICY.passwordRequiredByAdminSdk).toBe(false);
    expect(PHASE_5I_PASSWORD_POLICY.displayAllowed).toBe(false);
    expect(PHASE_5I_PASSWORD_POLICY.persistAllowed).toBe(false);
    expect(PHASE_5I_PASSWORD_POLICY.loginAllowed).toBe(false);
  });

  it("6. UID strategy: Auth-generated === Firestore id; markers not prefix alone", () => {
    expect(PHASE_5I_UID_STRATEGY.preferAuthGeneratedUid).toBe(true);
    expect(PHASE_5I_UID_STRATEGY.authUidEqualsFirestoreDocId).toBe(true);
    expect(PHASE_5I_UID_STRATEGY.syntheticViaIdPrefixAlone).toBe(false);
    expect(PHASE_5I_UID_STRATEGY.syntheticViaFirestoreMarkers).toBe(true);
    expect(PHASE_5I_UID_STRATEGY.forbidOrphanNonAuthDocIds).toBe(true);
  });

  it("7. disabled Auth compatible with claims + membership + future Pilot", () => {
    const d = assessDisabledAuthCompatibility();
    expect(d.disabledTrueCompatibleWithSetCustomUserClaims).toBe(true);
    expect(d.disabledBlocksClientSignIn).toBe(true);
    expect(d.futureNeedsChangesPilotIsFirestoreDomainOnly).toBe(true);
  });
});

describe("Phase 5I — syncUserClaimsOnWrite exact effect", () => {
  it("8. expected claims = {country_id}; key count = 1", () => {
    const claims = deriveExpectedCustomClaimsFromUserData(
      PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
        string,
        unknown
      >,
    );
    expect(claims).toEqual({
      country_id: "countries/saudi_arabia",
    });
    expect(Object.keys(claims)).toHaveLength(PHASE_5I_EXPECTED_CLAIM_KEY_COUNT);
    expect(PHASE_5I_EXPECTED_CUSTOM_CLAIMS).toEqual(claims);
  });

  it("9. elevated privilege absent → AUTH_SAFE_FIXTURE_GO", () => {
    const a = assessClaimsForFixtureDoc(PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC);
    expect(a.elevatedPrivilege).toBe(false);
    expect(a.verdict).toBe("AUTH_SAFE_FIXTURE_GO");
    expect(a.elevatedKeysPresent).toEqual([]);
    for (const k of PHASE_5I_ELEVATED_CLAIM_KEYS) {
      expect(a.expectedCustomClaims[k as keyof typeof a.expectedCustomClaims]).not.toBe(
        true,
      );
    }
  });

  it("10. elevated claims → AUTH_SAFE_FIXTURE_NO_GO", () => {
    const bad = assessElevatedPrivilegeForClaims({
      super_admin: true,
      finance: true,
    });
    expect(bad.verdict).toBe("AUTH_SAFE_FIXTURE_NO_GO");
    expect(bad.elevatedPrivilege).toBe(true);
  });

  it("11. no synthetic_fixture claim; prefer Firestore markers; do not modify trigger", () => {
    expect(PHASE_5I_SYNTHETIC_FIXTURE_CLAIM_POLICY.addSyntheticFixtureClaim).toBe(
      false,
    );
    expect(PHASE_5I_SYNC_USER_CLAIMS_EFFECT.modifyProductionTrigger).toBe(
      "forbidden",
    );
    expect(PHASE_5I_SYNC_USER_CLAIMS_EFFECT.bypassTrigger).toBe("forbidden");
    expect(
      PHASE_5I_SYNC_USER_CLAIMS_EFFECT.alwaysCallsSetCustomUserClaimsWhenAfterExists,
    ).toBe(true);
  });
});

describe("Phase 5I — Firestore schema / membership / synthetic", () => {
  it("12. typed payload: ismndob / pending_review / idle / markers", () => {
    const d = PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC;
    expect(d.ismndob).toBe(true);
    expect(d.registration_status).toBe("pending_review");
    expect(d.actev_mndob).toBe(false);
    expect(d.is_test).toBe(true);
    expect(d.functional_test).toBe(true);
    expect(d.qa_fixture).toBe(true);
    expect(d.on_trip).toBe(false);
    expect(d.mndon_newacc).toBe(false);
    expect(d.is_online).toBe(false);
  });

  it("13. forbidden PII / role / finance fields absent", () => {
    const keys = Object.keys(PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC);
    for (const f of PHASE_5I_FIXTURE_FORBIDDEN_FIELDS) {
      expect(keys).not.toContain(f);
    }
    expect(PHASE_5I_PII_POLICY.realPiiAllowed).toBe(false);
  });

  it("14. country/city closed maps → mapped/mapped", () => {
    const g = resolvePhase5IFixtureGeography();
    expect(g.countryId).toBe(PHASE_5I_FIXTURE_COUNTRY_ID);
    expect(g.cityId).toBe(PHASE_5I_FIXTURE_CITY_ID);
    expect(g.countryMapping).toBe("mapped");
    expect(g.cityMapping).toBe("mapped");
  });

  it("15. role exclusion → authoritativeRole=driver; operational; synthetic", () => {
    const m = assertPhase5IMembershipAndSynthetic({
      documentId: PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE,
    });
    expect(m.authoritativeRole).toBe("DRIVER");
    expect(m.authoritativeRoleReport).toBe("driver");
    expect(m.operationalDriver).toBe(true);
    expect(m.synthetic).toBe(true);
    expect(m.safePilotEligible).toBe(true);
    expect(m.plannedAction).toBe("needs_changes");
  });

  it("16. Auth-shaped UID without test_ prefix still proven synthetic via markers", () => {
    const data = PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
      string,
      unknown
    >;
    const proven = classifyProvenSyntheticDriver({
      documentId: PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE,
      data,
    });
    expect(proven.ok).toBe(true);
    expect(proven.markersMatched).not.toContain("documentId_prefix");
    expect(proven.markersMatched).toEqual(
      expect.arrayContaining(["is_test", "functional_test", "qa_fixture"]),
    );
    expect(classifyDriverMembership(data).authoritativeRole).toBe("DRIVER");
  });

  it("17. Admin/Agent contamination fails role exclusion", () => {
    expect(() =>
      assertPhase5IMembershipAndSynthetic({
        documentId: PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE,
        data: {
          ...PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
          IsAdmin: true,
        } as never,
      }),
    ).toThrow(/Role exclusion/);
  });
});

describe("Phase 5I — communication / side-effect matrix", () => {
  it("18. no email/OTP/SMS/push/welcome → COMMUNICATION_GO", () => {
    const c = assessCommunicationSideEffects();
    expect(c.email).toBe(false);
    expect(c.otp).toBe(false);
    expect(c.sms).toBe(false);
    expect(c.push).toBe(false);
    expect(c.welcome).toBe(false);
    expect(c.uncontrolledCommunication).toBe(false);
    expect(c.verdict).toBe("COMMUNICATION_GO");
  });

  it("19. syncUserClaims bounded_predictable on Auth-safe path; finance/trip none", () => {
    expect(classifySyncClaimsForAuthSafePath()).toBe("bounded_predictable");
    const finance = PHASE_5I_SIDE_EFFECT_MATRIX.find((r) =>
      r.surface.includes("Wallet"),
    );
    const trip = PHASE_5I_SIDE_EFFECT_MATRIX.find((r) =>
      r.surface.includes("Trip"),
    );
    expect(finance!.onUserDocCreate).toBe(false);
    expect(trip!.onUserDocCreate).toBe(false);
    expect(PHASE_5I_SIDE_EFFECT_MATRIX.length).toBeGreaterThanOrEqual(8);
  });
});

describe("Phase 5I — provisioning order / partial / idempotency / registry", () => {
  it("20. order: Auth create → Firestore → claims → verify", () => {
    expect(PHASE_5I_PROVISIONING_ORDER[0]).toBe("auth_createUser_disabled");
    expect(PHASE_5I_PROVISIONING_ORDER[1]).toBe(
      "firestore_user_doc_create_same_uid",
    );
    expect(PHASE_5I_PROVISIONING_ORDER[2]).toBe(
      "syncUserClaimsOnWrite_setCustomUserClaims",
    );
  });

  it("21. state machine includes pilot_ready / failed_partial / retired", () => {
    const tos = PHASE_5I_FIXTURE_STATE_MACHINE.map((e) => e.to);
    expect(tos).toContain("pilot_ready");
    expect(tos).toContain("failed_partial");
    expect(tos).toContain("retired");
  });

  it("22. partial Auth-only orphan forbids multi-create", () => {
    expect(
      PHASE_5I_PARTIAL_FAILURE_HANDLING.authOnlyOrphan.multiCreateForbidden,
    ).toBe(true);
    const reg = {
      ...buildEmptyOperatorRegistryRecord(),
      uid: "orphanUid123",
      status: "auth_created" as const,
    };
    const gate = evaluateIdempotencyGate(reg);
    expect(gate.allowAuthCreate).toBe(false);
    expect(gate.code).toBe("RESUME_FIRESTORE_ONLY");
  });

  it("23. create-only idempotency; registry has no password/token/PII", () => {
    expect(PHASE_5I_CREATE_SEMANTICS.mode).toBe("create_only");
    expect(PHASE_5I_CREATE_SEMANTICS.multiCreateForbidden).toBe(true);
    const empty = buildEmptyOperatorRegistryRecord();
    expect(empty.logicalName).toBe(PHASE_5I_LOGICAL_FIXTURE_NAME);
    expect(empty.passwordStored).toBe(false);
    expect(empty.tokenStored).toBe(false);
    expect(empty.piiStored).toBe(false);
    expect(evaluateIdempotencyGate(empty).allowAuthCreate).toBe(true);
  });

  it("24. already provisioned → FIXTURE_ALREADY_EXISTS", () => {
    const reg = {
      ...buildEmptyOperatorRegistryRecord(),
      uid: "existingUid",
      status: "pilot_ready" as const,
    };
    expect(evaluateIdempotencyGate(reg).code).toBe("FIXTURE_ALREADY_EXISTS");
  });
});

describe("Phase 5I — write counts / service / dry-run", () => {
  it("25. future provision counts: auth1 firestore1 claims1 finance0 trip0", () => {
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.authCreate).toBe(1);
    expect(
      PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.firestoreUserCreates,
    ).toBe(1);
    expect(
      PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.claimsSetCustomUserClaims,
    ).toBe(1);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.triggerInvocations).toBe(
      1,
    );
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.financeWrites).toBe(0);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.tripWrites).toBe(0);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.agentWrites).toBe(0);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION.customerWrites).toBe(
      0,
    );
  });

  it("26. dryRun: wouldWrite=false; actualWrite=false; AUTH_SAFE GO", () => {
    const r = runPhase5ISyntheticDriverProvisionDryRun();
    expect(r.mode).toBe("dry_run");
    expect(r.wouldWrite).toBe(false);
    expect(r.actualWrite).toBe(false);
    expect(r.elevatedVerdict).toBe("AUTH_SAFE_FIXTURE_GO");
    expect(r.productionWrites).toBe(0);
    expect(r.authWrites).toBe(0);
    expect(r.financeWrites).toBe(0);
    expect(r.tripWrites).toBe(0);
    expect(r.syncClaimsClass).toBe("bounded_predictable");
  });

  it("27. provision SKIP when env unset", async () => {
    const svc = createSyntheticDriverProvisioningService();
    const r = await svc.provision();
    expect(r.ok).toBe(false);
    expect(r.actualWrite).toBe(false);
    if (!r.ok) expect(r.code).toBe("PHASE5I_PROVISION_SKIP");
  });

  it("28. provision armed but write disabled → PROVISIONING_WRITE_DISABLED", async () => {
    const svc = createSyntheticDriverProvisioningService();
    const r = await svc.provision({ provisionEnv: "1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PROVISIONING_WRITE_DISABLED");
      expect(r.authWrites).toBe(0);
    }
  });

  it("29. provision fully armed without global write gates → PROVISIONING_WRITE_DISABLED", async () => {
    const svc = createSyntheticDriverProvisioningService();
    const r = await svc.provision({
      provisionEnv: "1",
      authFixtureWriteEnv: "1",
      projectId: "tutorial-multi-language-70gx4j",
    });
    expect(r.ok).toBe(false);
    expect(r.actualWrite).toBe(false);
    if (!r.ok) expect(r.code).toBe("PROVISIONING_WRITE_DISABLED");
  });

  it("30. verify offline membership+claims+communication ok", () => {
    const svc = createSyntheticDriverProvisioningService();
    const v = svc.verify();
    expect(v.actualWrite).toBe(false);
    expect(v.membershipOk).toBe(true);
    expect(v.claimsOk).toBe(true);
    expect(v.elevatedOk).toBe(true);
    expect(v.communicationOk).toBe(true);
    expect(v.pilotReadyShape).toBe(true);
  });
});

describe("Phase 5I — isolation guards", () => {
  it("31. dry-run registry logical name; no PII; create-only semantics", () => {
    const r = runPhase5ISyntheticDriverProvisionDryRun();
    expect(r.logicalName).toBe("phase5i_driver_pilot_fixture_v1");
    expect(r.registry.passwordStored).toBe(false);
    expect(r.piiPolicy.realPiiAllowed).toBe(false);
    expect(PHASE_5I_CREATE_SEMANTICS.merge).toBe(false);
    expect(PHASE_5I_CREATE_SEMANTICS.overwrite).toBe(false);
  });

  it("32. design write counts all zero; finance/trip/agent/customer isolation", () => {
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION.authCreate).toBe(0);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION.financeWrites).toBe(0);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION.tripWrites).toBe(0);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION.agentWrites).toBe(0);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION.customerWrites).toBe(
      0,
    );
    expect(
      PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.FINANCE_WRITE_ENABLED,
    ).toBe(false);
  });
});
