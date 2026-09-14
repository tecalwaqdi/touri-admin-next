/**
 * Phase 4A-5 — Drivers Fake/unit readiness suite.
 * NO Production Firebase calls. FULL_PII_SHADOW_ENABLED=false. All write flags false.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, resetEnvCache, getEnv } from "@/config/env";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import {
  LiveResourceNotEnabledError,
  parseLiveShadowAllowedResources,
  PHASE_4A5_LIVE_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { mapCanonicalDriverFromLegacyDoc } from "@/domain/driver/mapCanonicalDriverRead";
import { mapDriverCanonicalStatuses } from "@/domain/driver/DriverCanonicalStatuses";
import { resolveCanonicalDriverRegistrationStatus } from "@/domain/driver/CanonicalDriverRegistrationStatus";
import { buildDriverComplianceSafeSummary } from "@/domain/driver/DriverComplianceSummary";
import {
  buildDriverVehicleSafeSummary,
  maskPlate,
} from "@/domain/driver/DriverVehicleSafeSummary";
import {
  DRIVER_FINANCIAL_FIELD_NOTES,
  summarizeDriverFinancialPresence,
} from "@/domain/driver/DriverFinancialFieldNotes";
import {
  auditDriverDuplicates,
  driverMappingReadyForLiveClose,
  hashDriverPhoneForAudit,
  hashDriverPlateForAudit,
  isTestOrNoncanonicalDriver,
  reconcileDriverAuditPartition,
  rowFromCanonicalDriver,
} from "@/domain/driver/DriverDuplicateIdentityAudit";
import {
  buildDriverMappingDiagnostic,
  diagnosticFromCanonicalDriver,
  driverLiveClosingGatesPass,
  driverLiveReportHasSensitiveLeak,
  excludedNonDriverHasAuthoritativeEvidence,
  formatDriverMappingNoGoMessage,
  selectDriverDiagnosticsForLiveSummary,
} from "@/domain/driver/DriverMappingDiagnostic";
import {
  classifyAuthoritativeLegacyRole,
  classifyDriverMembership,
} from "@/domain/driver/DriverRoleClassification";
import { isPhase4A5LiveDriversEnabled } from "@/domain/driver/isPhase4A5LiveDriversEnabled";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import {
  FirebaseProductionDriverReadRepository,
  PHASE_4A5_DRIVERS_MAX_PAGE,
  PHASE_4A5_DRIVER_DISCRIMINATOR_FIELD,
} from "@/infrastructure/production/repositories/FirebaseProductionDriverReadRepository";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { SENSITIVE_FIELD_REGISTRY } from "@/domain/read/SensitiveFieldRegistry";
import { isCollectionAllowedForProductionRead } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";
import { createProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ctx(
  overrides?: Partial<ProductionReadContext>,
): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a5",
    permissions: ["drivers:read"],
    requestId: "req-4a5",
    correlationId: "corr-4a5",
    ...overrides,
  };
}

const liveDriversStartupBase = {
  PRODUCTION_READ_ENABLED: true,
  PRODUCTION_READ_MODE: "shadow" as const,
  AUTH_MODE: "verified_token" as const,
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  PRODUCTION_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  FULL_PII_SHADOW_ENABLED: false,
  LIVE_SHADOW_ALLOWED_RESOURCES: "drivers",
  PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const,
};

const approvedSaDriver = {
  id: "drv_sa_riyadh_001",
  data: {
    uid: "drv_sa_riyadh_001",
    ismndob: true,
    ismndom: true,
    actev_mndob: true,
    registration_status: "approved",
    submission_status: "approved",
    ngl: false,
    mndon_newacc: false,
    operational_status: "offline",
    account_status: "active",
    display_name: "Driver SA",
    Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
    mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
    mndob_type_car: { path: "type_car/sedan", id: "sedan" },
    NameCar: "Camry",
    ModelCar: "2022",
    number_lohh_car: "ABC 1234",
    phone_number: "+966501112233",
    phone_n: 966501112233,
    email: "driver@example.com",
    ID_hoyh_MNDOB: "1234567890",
    img_id: "https://example.com/license.jpg",
    img_id_rksh: "https://example.com/nid.jpg",
    img_id_car: "https://example.com/vreg.jpg",
    registration_documents_status: "complete",
    document_review_status: "approved",
    total_mndob: 100.5,
    total_app: 15,
    Outstandingonlinepayment: 0,
    ipanBank: "SA0380000000608010167519",
    bankIdAcc: "secret-acc",
    created_time: "2026-09-01T10:00:00.000Z",
    loceshnMndobNow: { lat: 24.7, lng: 46.7 },
  },
};

describe("Phase 4A-5 defaults + startup", () => {
  beforeEach(() => resetEnvCache());

  it("Production Read remains disabled by default", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
  });

  it("startup accepts drivers-only live window", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow(liveDriversStartupBase),
    ).not.toThrow();
    expect(PHASE_4A5_LIVE_RESOURCES).toEqual(["drivers"]);
  });

  it("startup rejects drivers+trips widen", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveDriversStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "drivers,trips",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("startup rejects DRIVER_WRITE_ENABLED with drivers read", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveDriversStartupBase,
        DRIVER_WRITE_ENABLED: true,
      }),
    ).toThrow(/DRIVER_WRITE_ENABLED=true/);
  });

  it("startup rejects FULL_PII_SHADOW_ENABLED", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveDriversStartupBase,
        FULL_PII_SHADOW_ENABLED: true,
      }),
    ).toThrow(/FULL_PII_SHADOW_ENABLED/);
  });

  it("loadEnv accepts drivers-only live config", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_ENABLED: true,
      PRODUCTION_READ_MODE: "shadow",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      EXPECTED_ENVIRONMENT: "production",
      LIVE_SHADOW_ALLOWED_RESOURCES: "drivers",
      PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
      FULL_PII_SHADOW_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
    });
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("drivers");
  });
});

describe("Phase 4A-5 registration lifecycle + six axes", () => {
  it("maps registration aliases without collapsing account", () => {
    expect(
      resolveCanonicalDriverRegistrationStatus({
        registration_status: "changes_requested",
      }).status,
    ).toBe("needs_changes");
    expect(
      resolveCanonicalDriverRegistrationStatus({
        submission_status: "submitted",
      }).status,
    ).toBe("pending_review");
  });

  it("pending_review + actev_mndob=true ≠ approved", () => {
    const s = mapDriverCanonicalStatuses({
      registration_status: "pending_review",
      actev_mndob: true,
      ngl: true,
      mndon_newacc: false,
    });
    expect(s.registration.value).toBe("pending_review");
    expect(s.account.value).toBe("enabled");
    expect(s.online.value).toBe("online");
    expect(s.availability.value).toBe("available");
    expect(s.warnings.some((w) => /≠ approved/.test(w))).toBe(true);
  });

  it("does not derive registration from account or online", () => {
    const s = mapDriverCanonicalStatuses({
      actev_mndob: true,
      ngl: true,
      mndon_newacc: false,
    });
    expect(s.registration.value).toBe("unknown");
    expect(s.account.value).toBe("enabled");
    expect(s.online.value).toBe("online");
  });

  it("uses ngl when is_online absent", () => {
    const s = mapDriverCanonicalStatuses({
      registration_status: "approved",
      actev_mndob: true,
      ngl: false,
      mndon_newacc: true,
    });
    expect(s.online.value).toBe("offline");
    expect(s.tripState.value).toBe("busy");
    expect(s.availability.value).toBe("busy");
  });

  it("keeps tripState unknown when busy flags absent", () => {
    const s = mapDriverCanonicalStatuses({
      registration_status: "approved",
      actev_mndob: true,
    });
    expect(s.tripState.value).toBe("unknown");
    expect(s.online.value).toBe("unknown");
    expect(s.availability.value).toBe("unknown");
  });

  it("maps suspended/blocked and draft", () => {
    expect(
      resolveCanonicalDriverRegistrationStatus({
        registration_status: "blocked",
      }).status,
    ).toBe("suspended");
    expect(
      resolveCanonicalDriverRegistrationStatus({
        registration_status: "draft",
      }).status,
    ).toBe("draft");
  });
});

describe("Phase 4A-5 identity + geography + mapper", () => {
  it("separates sourceDocumentId vs authUid mismatch", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "doc_abc",
      data: {
        ...approvedSaDriver.data,
        uid: "auth_other",
      },
    });
    expect(mapped.model.sourceDocumentId).toBe("doc_abc");
    expect(mapped.model.authUid).toBe("auth_other");
    expect(mapped.model.authUidKnowledge).toBe("mismatch");
  });

  it("maps Rev_dolh / mndob_vill with source paths — no GPS invent", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: approvedSaDriver.id,
      data: approvedSaDriver.data,
    });
    expect(mapped.model.countryId.value).toBe("saudi_arabia");
    expect(mapped.model.countrySourcePath).toBe("countries/saudi_arabia");
    expect(mapped.model.cityId.value).toBe("city_sa_riyadh");
    expect(mapped.model.citySourcePath).toBe("villages/city_sa_riyadh");
    expect(mapped.model.mappingStatus).toBe("validMapped");
    expect(JSON.stringify(mapped.model)).not.toMatch(/\+966501112233/);
    expect(JSON.stringify(mapped.model)).not.toMatch(/1234567890/);
    expect(JSON.stringify(mapped.model)).not.toMatch(/https:\/\/example\.com/);
    expect(JSON.stringify(mapped.model)).not.toMatch(/SA038000/);
  });

  it("unmappedCountry when Rev_dolh missing — never invents from GPS/phone", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "drv_x",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        phone_number: "+966500000000",
        loceshnMndobNow: { lat: 1, lng: 2 },
        mndob_vill: "villages/city_sa_riyadh",
      },
    });
    expect(mapped.model.mappingStatus).toBe("unmappedCountry");
    expect(mapped.model.countryId.value).toBeNull();
    expect(
      mapped.mappingWarnings.some((w) => /GPS/i.test(w.message)),
    ).toBe(true);
  });

  it("unknownDiscriminator for customer-like user without ismndob", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "cust_1",
      data: {
        ismndob: false,
        display_name: "Customer",
        Rev_dolh: "countries/saudi_arabia",
      },
    });
    expect(mapped.model.isDriver).toBe(false);
    expect(mapped.model.mappingStatus).toBe("unknownDiscriminator");
  });

  it("approved + online ≠ invent trip busy without mndon_newacc", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "drv_online",
      data: {
        ...approvedSaDriver.data,
        ngl: true,
        mndon_newacc: false,
        operational_status: "online",
      },
    });
    expect(mapped.model.registrationStatus).toBe("approved");
    expect(mapped.model.onlineStatus).toBe("online");
    expect(mapped.model.tripState).toBe("idle");
    expect(mapped.model.availabilityStatus).toBe("available");
  });
});

describe("Phase 4A-5 compliance + vehicle + financial classify", () => {
  it("compliance summary is presence-only without URLs", () => {
    const c = buildDriverComplianceSafeSummary(approvedSaDriver.data);
    expect(c.overall).toBe("ready");
    expect(c.slots.every((s) => s.presence === "present" || s.presence === "unknown" || s.presence === "missing")).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/https:/);
  });

  it("masks plate and never exposes normalized_plate", () => {
    expect(maskPlate("ABC 1234")).toBe("AB***34");
    const v = buildDriverVehicleSafeSummary(approvedSaDriver.data);
    expect(v.platePresent).toBe(true);
    expect(v.plateMasked).not.toBe("ABC 1234");
    expect(v.normalizedPlateExposed).toBe(false);
  });

  it("financial fields documented only — not authoritative", () => {
    const f = summarizeDriverFinancialPresence(approvedSaDriver.data);
    expect(f.isAuthoritative).toBe(false);
    expect(f.isSettlementSafe).toBe(false);
    expect(f.isAccountingApproved).toBe(false);
    expect(f.fieldsPresent).toContain("total_mndob");
    expect(DRIVER_FINANCIAL_FIELD_NOTES.some((n) => n.legacyField === "ipanBank")).toBe(
      true,
    );
  });
});

describe("Phase 4A-5 duplicate audit + test markers", () => {
  it("hashes phone without exposing digits in hash input leftover", () => {
    const h = hashDriverPhoneForAudit("+966501112233");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain("5011");
  });

  it("detects authUid collisions and test markers", () => {
    const a = mapCanonicalDriverFromLegacyDoc({
      documentId: "d1",
      data: { ...approvedSaDriver.data, uid: "same_uid" },
    });
    const b = mapCanonicalDriverFromLegacyDoc({
      documentId: "d2",
      data: { ...approvedSaDriver.data, uid: "same_uid" },
    });
    const metrics = auditDriverDuplicates([
      rowFromCanonicalDriver(a.model, {
        phoneHash: hashDriverPhoneForAudit("+966501112233"),
        plateHash: hashDriverPlateForAudit("ABC1234"),
      }),
      rowFromCanonicalDriver(b.model, {
        phoneHash: hashDriverPhoneForAudit("+966501112233"),
        plateHash: hashDriverPlateForAudit("ABC1234"),
      }),
    ]);
    expect(metrics.authUidCollisions).toBe(2);
    expect(metrics.phoneHashCollisions).toBe(2);
    expect(metrics.plateHashCollisions).toBe(2);
    expect(
      isTestOrNoncanonicalDriver({
        documentId: "cp5_driver_1",
        data: {},
      }),
    ).toBe(true);
  });

  it("live-close blocked when unmappedCountry > 0", () => {
    expect(
      driverMappingReadyForLiveClose({
        recordsRead: 1,
        driverCandidates: 1,
        total: 1,
        validMapped: 0,
        testOrNoncanonical: 0,
        excludedNonDriver: 0,
        unmappedCountry: 1,
        unmappedCity: 0,
        malformed: 0,
        unknownRegistration: 0,
        conflictingRegistration: 0,
        exactDocumentIdDuplicates: 0,
        activeOperationalDuplicates: 0,
        authUidCollisions: 0,
        phoneHashCollisions: 0,
        plateHashCollisions: 0,
        unknownDiscriminator: 0,
        missingAuthUid: 0,
        authUidMismatch: 0,
        unexpectedCollections: 0,
      }),
    ).toBe(false);
  });
});

describe("Phase 4A-5 repository Fake query + gates", () => {
  it("queries user with ismndob==true, limit≤50, no N+1", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      approvedSaDriver,
      {
        id: "cust_not_driver",
        data: {
          ismndob: false,
          display_name: "Cust",
          created_time: "2026-09-02T00:00:00.000Z",
        },
      },
      {
        id: "drv_sa_2",
        data: {
          ...approvedSaDriver.data,
          uid: "drv_sa_2",
          ngl: true,
          created_time: "2026-09-03T00:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.items.every((e) => e.data.isDriver)).toBe(true);
    expect(page.items.length).toBe(2);
    expect(page.queryMeta.discriminatorField).toBe(
      PHASE_4A5_DRIVER_DISCRIMINATOR_FIELD,
    );
    expect(page.queryMeta.queryLimit).toBeLessThanOrEqual(
      PHASE_4A5_DRIVERS_MAX_PAGE,
    );
    expect(client.queryLog).toHaveLength(1);
    expect(client.queryLog[0].collection).toBe("user");
    expect(client.getLog).toHaveLength(0);
    expect(isCollectionAllowedForProductionRead("user")).toBe(true);
  });

  it("rejects page limit > 50", async () => {
    const client = new FakeFirestoreReadClient();
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    await expect(repo.list(ctx(), {}, { limit: 51 })).rejects.toThrow(
      QuerySafetyError,
    );
  });

  it("resource gate denies when drivers not allowed", async () => {
    const client = new FakeFirestoreReadClient();
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["trips"]),
    });
    await expect(repo.list(ctx(), {}, { limit: 10 })).rejects.toThrow(
      LiveResourceNotEnabledError,
    );
  });

  it("kill switch denies when Production read disabled", async () => {
    const client = new FakeFirestoreReadClient();
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: false,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    await expect(repo.list(ctx(), {}, { limit: 10 })).rejects.toThrow(
      ProductionReadDisabledError,
    );
  });

  it("post-map country scope filters", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      approvedSaDriver,
      {
        id: "drv_kg",
        data: {
          ...approvedSaDriver.data,
          uid: "drv_kg",
          Rev_dolh: { path: "countries/kyrgyzstan", id: "kyrgyzstan" },
          mndob_vill: { path: "villages/city_kg_bishkek", id: "city_kg_bishkek" },
          created_time: "2026-09-04T00:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    const page = await repo.list(
      ctx({
        scope: { type: "country", countryIds: ["saudi_arabia"] },
        serverScopeFilter: { countryIds: ["saudi_arabia"] },
      }),
      { countryIds: ["saudi_arabia"] },
      { limit: 50 },
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0].data.countryId.value).toBe("saudi_arabia");
  });

  it("getById returns null for non-driver user", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      { id: "cust_1", data: { ismndob: false, display_name: "C" } },
    ]);
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    expect(await repo.getById(ctx(), "cust_1")).toBeNull();
  });

  it("write trap denies mutations; PII registry covers driver fields", () => {
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/drivers/approve",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");

    const drvFields = SENSITIVE_FIELD_REGISTRY.filter(
      (r) => r.resource === "driver",
    );
    expect(drvFields.some((r) => r.field === "phone_number")).toBe(true);
    expect(drvFields.some((r) => r.field === "ID_hoyh_MNDOB")).toBe(true);
    expect(drvFields.some((r) => r.field === "number_lohh_car")).toBe(true);

    expect(
      parseLiveShadowAllowedResources("drivers").has("drivers"),
    ).toBe(true);
  });

  it("wired container list uses Fake only", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [approvedSaDriver]);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    const page = await repos.drivers.list(ctx(), {}, { limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].meta.piiRedacted).toBe(true);
  });
});

describe("Phase 4A-5 DriverMappingDiagnostic + live guard", () => {
  it("isPhase4A5LiveDriversEnabled pure helper", () => {
    expect(isPhase4A5LiveDriversEnabled(undefined)).toBe(false);
    expect(isPhase4A5LiveDriversEnabled("")).toBe(false);
    expect(isPhase4A5LiveDriversEnabled("0")).toBe(false);
    expect(isPhase4A5LiveDriversEnabled("1")).toBe(true);
    expect(isPhase4A5LiveDriversEnabled("true")).toBe(false);
  });

  it("builds safe unmappedCountry diagnostic with source refs — no PII", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "drv_unknown_country_x",
      data: {
        ismndob: true,
        registration_status: "approved",
        Rev_dolh: { path: "countries/unknown_stale_xx", id: "unknown_stale_xx" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
        phone_number: "+966501112233",
        email: "secret@example.com",
        display_name: "ShouldNotAppearInDiag",
      },
    });
    expect(mapped.model.mappingStatus).toBe("unmappedCountry");
    const diag = diagnosticFromCanonicalDriver(mapped.model);
    expect(diag).toMatchObject({
      sourceDocumentId: "drv_unknown_country_x",
      sourceCountryReferencePath: "countries/unknown_stale_xx",
      sourceCountryReferenceId: "unknown_stale_xx",
      sourceCityReferencePath: "villages/city_sa_riyadh",
      sourceCityReferenceId: "city_sa_riyadh",
      registrationStatus: "approved",
      mappingStatus: "unmappedCountry",
      testClassification: "operational",
      countryMapping: "unmapped",
      cityMapping: "present",
    });
    const serialized = JSON.stringify(diag);
    expect(serialized).not.toMatch(/\+966/);
    expect(serialized).not.toMatch(/secret@/);
    expect(serialized).not.toMatch(/ShouldNotAppearInDiag/);
    expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  });

  it("missing Rev_dolh → countryMapping missing; never invents from city/GPS", () => {
    const diag = buildDriverMappingDiagnostic({
      sourceDocumentId: "drv_no_country",
      driverCandidate: true,
      authoritativeRole: "DRIVER",
      roleEvidenceKind: "firestore_driver_registration_status",
      sourceCountryReferencePath: null,
      sourceCityReferencePath: "villages/city_sa_makkah",
      registrationStatus: "pending_review",
      mappingStatus: "unmappedCountry",
      testClassification: "operational",
    });
    expect(diag.countryMapping).toBe("missing");
    expect(diag.sourceCountryReferenceId).toBeNull();
    expect(diag.cityMapping).toBe("present");
  });

  it("testOrNoncanonical markers are evidence-backed independently", () => {
    // Legacy AdminQaFixture / CP5 / demo_ seed id prefixes + functional_test flags.
    expect(
      isTestOrNoncanonicalDriver({ documentId: "cp5_driver_1", data: {} }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({ documentId: "test_driver_x", data: {} }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({ documentId: "demo_mndob_1", data: {} }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({ documentId: "qa_driver_1", data: {} }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({
        documentId: "real_uid_abc",
        data: { functional_test: true },
      }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({
        documentId: "real_uid_abc",
        data: { qa_fixture: true },
      }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({
        documentId: "real_uid_abc",
        data: { display_name: "FUNCTIONAL TEST DRIVER" },
      }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({
        documentId: "real_uid_abc",
        data: { email: "x@touri-taxi-test.local" },
      }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalDriver({
        documentId: "real_uid_abc",
        countryId: "cp5_country_1787562918003",
        data: {},
      }),
    ).toBe(true);
    // Operational driver with mapped demo_saudi country is NOT test solely from country alias.
    expect(
      isTestOrNoncanonicalDriver({
        documentId: "real_uid_operational",
        countryId: "demo_saudi",
        data: { ismndob: true },
      }),
    ).toBe(false);
    expect(resolveCanonicalCountryId("demo_saudi").status).toBe("mapped");
  });

  it("does not reclassify operational unmapped as test to clear counts", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "operational_unmapped",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        Rev_dolh: "countries/not_in_canonical_table_zz",
        mndob_vill: "villages/city_sa_riyadh",
      },
    });
    expect(mapped.model.mappingStatus).toBe("unmappedCountry");
    expect(mapped.model.mappingStatus).not.toBe("testOrNoncanonical");
  });

  it("list returns diagnostics for unmapped + test rows", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      approvedSaDriver,
      {
        id: "cp5_driver_fixture",
        data: {
          ...approvedSaDriver.data,
          uid: "cp5_driver_fixture",
          functional_test: true,
          created_time: "2026-09-05T00:00:00.000Z",
        },
      },
      {
        id: "drv_unmapped_c",
        data: {
          ...approvedSaDriver.data,
          uid: "drv_unmapped_c",
          Rev_dolh: { path: "countries/ghost_country", id: "ghost_country" },
          created_time: "2026-09-06T00:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.driverMappingDiagnostics.length).toBeGreaterThanOrEqual(2);
    expect(
      page.driverMappingDiagnostics.some(
        (d) => d.mappingStatus === "unmappedCountry",
      ),
    ).toBe(true);
    expect(
      page.driverMappingDiagnostics.some(
        (d) => d.testClassification === "testOrNoncanonical",
      ),
    ).toBe(true);
    expect(page.auditMetrics.unmappedCountry).toBe(1);
    expect(page.auditMetrics.testOrNoncanonical).toBe(1);
    expect(
      driverLiveClosingGatesPass({
        unmappedCountry: page.auditMetrics.unmappedCountry,
        unmappedCity: page.auditMetrics.unmappedCity,
        unknownDiscriminator: page.auditMetrics.unknownDiscriminator,
        malformed: page.auditMetrics.malformed,
        conflictingRegistration: page.auditMetrics.conflictingRegistration,
        activeOperationalDuplicates:
          page.auditMetrics.activeOperationalDuplicates,
        exactDocumentIdDuplicates: page.auditMetrics.exactDocumentIdDuplicates,
        unexpectedCollections: page.auditMetrics.unexpectedCollections,
        productionWrites: 0,
        excludedNonDriver: page.auditMetrics.excludedNonDriver,
        excludedNonDriverWithoutEvidence: 0,
      }),
    ).toBe(false);
    expect(
      formatDriverMappingNoGoMessage(page.driverMappingDiagnostics),
    ).toMatch(/drv_unmapped_c/);
    const selected = selectDriverDiagnosticsForLiveSummary(
      page.items.map((e) => e.data),
    );
    expect(JSON.stringify(selected)).not.toMatch(/\+966/);
  });

  it("emits kill_switch_triggered via file_ndjson observability (writes remain 0)", () => {
    const dir = mkdtempSync(join(tmpdir(), "phase4a5-kill-"));
    const file = join(dir, "obs.ndjson");
    try {
      const obs = createProductionReadObservability({
        sink: "file_ndjson",
        filePath: file,
      });
      obs.emit({
        type: "kill_switch_triggered",
        flag: "PRODUCTION_READ_ENABLED",
      });
      const line = readFileSync(file, "utf8");
      expect(line).toContain("kill_switch_triggered");
      expect(line).toContain("PRODUCTION_READ_ENABLED");
      expect(driverLiveReportHasSensitiveLeak(line)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Phase 4A-5 driver role contamination exclusion", () => {
  const affectedId = "ZA8yOrIEYIZnmXx85ja9yyctIJu1";

  it("auth_inventory SUPERADMIN evidence: IsAdmin / isAdminRule=1 without Auth claims", () => {
    // Mirrors pre_reset_inventory.js isSuper when customClaims={}.
    const fromIsAdmin = classifyAuthoritativeLegacyRole({ IsAdmin: true });
    expect(fromIsAdmin.role).toBe("SUPERADMIN");
    expect(fromIsAdmin.roleEvidenceKind).toBe("firestore_IsAdmin");
    expect(fromIsAdmin.isKnownAdministrativeIdentity).toBe(true);

    const fromRule = classifyAuthoritativeLegacyRole({ isAdminRule: 1 });
    expect(fromRule.role).toBe("SUPERADMIN");
    expect(fromRule.roleEvidenceKind).toBe("firestore_isAdminRule");
  });

  it("SUPERADMIN with ismndob + missing Rev_dolh → excludedNonDriver, NOT unmappedCountry", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: affectedId,
      data: {
        ismndob: true,
        IsAdmin: true,
        isAdminRule: 1,
        // Auth claims empty in Legacy export — not consulted here
        // Missing Rev_dolh must NOT count as Driver unmappedCountry
      },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonDriver");
    expect(mapped.model.mappingStatus).not.toBe("unmappedCountry");
    expect(mapped.model.authoritativeRole).toBe("SUPERADMIN");
    expect(mapped.model.roleEvidenceKind).toBe("firestore_IsAdmin");
    expect(mapped.model.isDriverCandidate).toBe(true);
    expect(mapped.model.isOperationalDriver).toBe(false);
    expect(mapped.model.isDriver).toBe(false);

    const diag = diagnosticFromCanonicalDriver(mapped.model);
    expect(diag.driverCandidate).toBe(true);
    expect(diag.authoritativeRole).toBe("SUPERADMIN");
    expect(diag.countryMapping).toBe("excludedNonDriver");
    expect(excludedNonDriverHasAuthoritativeEvidence(diag)).toBe(true);
    expect(JSON.stringify(diag)).not.toMatch(/@/);
  });

  it("ismndob alone is insufficient — malformed without proven driver-role evidence", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "ismndob_only_uid",
      data: {
        ismndob: true,
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      },
    });
    expect(mapped.model.mappingStatus).toBe("malformed");
    expect(mapped.model.isOperationalDriver).toBe(false);
    expect(mapped.model.incompleteReasons).toContain(
      "missing_proven_driver_role_evidence",
    );
  });

  it("real operational Driver + missing country still unmappedCountry", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "real_drv_missing_country",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        mndob_vill: "villages/city_sa_riyadh",
      },
    });
    expect(mapped.model.mappingStatus).toBe("unmappedCountry");
    expect(mapped.model.isOperationalDriver).toBe(true);
    expect(mapped.model.authoritativeRole).toBe("DRIVER");
  });

  it("membership predicate: candidate && !admin && proven driver evidence", () => {
    const admin = classifyDriverMembership({
      ismndob: true,
      IsAdmin: true,
      registration_status: "approved",
    });
    expect(admin.isDriverCandidate).toBe(true);
    expect(admin.isKnownAdministrativeIdentity).toBe(true);
    expect(admin.isOperationalDriver).toBe(false);

    const op = classifyDriverMembership({
      ismndob: true,
      registration_status: "pending_review",
    });
    expect(op.isOperationalDriver).toBe(true);
    expect(op.authoritativeRole).toBe("DRIVER");
  });

  it("excludedNonDriver with evidence does not block close; unmappedCountry does", () => {
    const excluded = mapCanonicalDriverFromLegacyDoc({
      documentId: affectedId,
      data: { ismndob: true, IsAdmin: true, isAdminRule: 1 },
    });
    const operational = mapCanonicalDriverFromLegacyDoc({
      documentId: approvedSaDriver.id,
      data: approvedSaDriver.data,
    });
    const rows = [
      rowFromCanonicalDriver(excluded.model),
      rowFromCanonicalDriver(operational.model),
    ];
    const metrics = auditDriverDuplicates(rows);
    expect(metrics.excludedNonDriver).toBe(1);
    expect(metrics.validMapped).toBe(1);
    expect(metrics.unmappedCountry).toBe(0);
    expect(reconcileDriverAuditPartition(metrics).ok).toBe(true);

    const diags = selectDriverDiagnosticsForLiveSummary([
      excluded.model,
      operational.model,
    ]);
    const withoutEvidence = diags.filter(
      (d) =>
        d.mappingStatus === "excludedNonDriver" &&
        !excludedNonDriverHasAuthoritativeEvidence(d),
    ).length;
    expect(
      driverMappingReadyForLiveClose(metrics, {
        excludedNonDriverWithoutEvidence: withoutEvidence,
      }),
    ).toBe(true);
    expect(
      driverLiveClosingGatesPass({
        unmappedCountry: 0,
        unmappedCity: 0,
        unknownDiscriminator: 0,
        malformed: 0,
        conflictingRegistration: 0,
        activeOperationalDuplicates: 0,
        exactDocumentIdDuplicates: 0,
        unexpectedCollections: 0,
        productionWrites: 0,
        excludedNonDriver: 1,
        excludedNonDriverWithoutEvidence: 0,
      }),
    ).toBe(true);
    expect(
      driverLiveClosingGatesPass({
        unmappedCountry: 1,
        unmappedCity: 0,
        unknownDiscriminator: 0,
        malformed: 0,
        conflictingRegistration: 0,
        activeOperationalDuplicates: 0,
        exactDocumentIdDuplicates: 0,
        unexpectedCollections: 0,
        productionWrites: 0,
        excludedNonDriver: 0,
        excludedNonDriverWithoutEvidence: 0,
      }),
    ).toBe(false);
  });

  it("metrics partition reconciles across all classifications", () => {
    const docs = [
      approvedSaDriver,
      {
        id: affectedId,
        data: { ismndob: true, IsAdmin: true, isAdminRule: 1 },
      },
      {
        id: "cp5_driver_fixture",
        data: {
          ...approvedSaDriver.data,
          uid: "cp5_driver_fixture",
          functional_test: true,
        },
      },
      {
        id: "drv_unmapped_c",
        data: {
          ...approvedSaDriver.data,
          uid: "drv_unmapped_c",
          Rev_dolh: { path: "countries/ghost_country", id: "ghost_country" },
        },
      },
      {
        id: "ismndob_only",
        data: { ismndob: true },
      },
    ];
    const models = docs.map((d) =>
      mapCanonicalDriverFromLegacyDoc({ documentId: d.id, data: d.data }).model,
    );
    const metrics = auditDriverDuplicates(
      models.map((m) => rowFromCanonicalDriver(m)),
    );
    expect(metrics.recordsRead).toBe(5);
    expect(metrics.driverCandidates).toBe(5);
    expect(metrics.validMapped).toBe(1);
    expect(metrics.excludedNonDriver).toBe(1);
    expect(metrics.testOrNoncanonical).toBe(1);
    expect(metrics.unmappedCountry).toBe(1);
    expect(metrics.malformed).toBe(1);
    expect(reconcileDriverAuditPartition(metrics).ok).toBe(true);
  });

  it("Auth UID is separated from role — uid field never grants SUPERADMIN", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "some_doc",
      data: {
        ismndob: true,
        uid: affectedId,
        registration_status: "approved",
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      },
    });
    expect(mapped.model.authUid).toBe(affectedId);
    expect(mapped.model.authoritativeRole).toBe("DRIVER");
    expect(mapped.model.mappingStatus).toBe("validMapped");
  });

  it("list classifies admin contamination and keeps testOrNoncanonical unchanged", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      approvedSaDriver,
      {
        id: affectedId,
        data: {
          ismndob: true,
          IsAdmin: true,
          isAdminRule: 1,
          created_time: "2026-09-07T00:00:00.000Z",
        },
      },
      {
        id: "cp5_driver_fixture",
        data: {
          ...approvedSaDriver.data,
          uid: "cp5_driver_fixture",
          functional_test: true,
          created_time: "2026-09-05T00:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionDriverReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["drivers"]),
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.auditMetrics.excludedNonDriver).toBe(1);
    expect(page.auditMetrics.testOrNoncanonical).toBe(1);
    expect(page.auditMetrics.unmappedCountry).toBe(0);
    expect(page.auditMetrics.validMapped).toBe(1);
    expect(reconcileDriverAuditPartition(page.auditMetrics).ok).toBe(true);
    expect(
      page.driverMappingDiagnostics.some(
        (d) =>
          d.sourceDocumentId === affectedId &&
          d.mappingStatus === "excludedNonDriver",
      ),
    ).toBe(true);
  });
});
