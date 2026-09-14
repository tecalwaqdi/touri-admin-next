/**
 * Phase 4A-4 — Missing city relations audit offline regressions.
 * NO Production Firebase calls. Fake + pure domain only.
 */
import { describe, expect, it } from "vitest";
import { mapCanonicalTripFromLegacyDoc } from "@/domain/trip/mapCanonicalTripRead";
import { mapTripFinancialSafeRead } from "@/domain/trip/TripFinancialSafeRead";
import {
  buildTripGeographyDiagnostic,
  classifyVillPresence,
  emptyTripGeographyCounters,
  summarizeSchemaPatternCohorts,
  tallyTripGeographyDiagnostic,
  tripCityClosingBucketsAllowClose,
  legacyVillOptionalProven,
} from "@/domain/trip/TripGeographyDiagnostic";
import {
  FirebaseProductionTripReadRepository,
} from "@/infrastructure/production/repositories/FirebaseProductionTripReadRepository";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { tripMappingReadyForLiveClose } from "@/domain/trip/TripDuplicateIdentityAudit";

function ctx(): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a4-city",
    permissions: ["trips:read"],
    requestId: "req-4a4-city",
    correlationId: "corr-4a4-city",
  };
}

const baseOrder = {
  status_code: "completed",
  payment_status: "cash_collected",
  PaymentMethod: "Cash",
  Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
  USER: { path: "user/cust_x", id: "cust_x" },
  mndob_user: { path: "user/drv_x", id: "drv_x" },
  data_order: "2026-09-10T08:00:00.000Z",
  total_app: 7.5,
  total_vat: 0,
  total_mndob: 42.5,
  total_mndob2: 50,
  listAmakn: [
    {
      naim: "Pickup",
      Revmkan: { path: "mkan/lm_a", id: "lm_a" },
    },
    {
      naim: "Dest",
      Revmkan: { path: "mkan/lm_b", id: "lm_b" },
    },
  ],
};

describe("Phase 4A-4 missing city relations — vill presence cases", () => {
  it("classifies absent_key / null / empty / wrong_type / path / docref", () => {
    expect(classifyVillPresence({})).toBe("absent_key");
    expect(classifyVillPresence({ vill: null })).toBe("null");
    expect(classifyVillPresence({ vill: "" })).toBe("empty_string");
    expect(classifyVillPresence({ vill: 12 })).toBe("wrong_type");
    expect(classifyVillPresence({ vill: true })).toBe("wrong_type");
    expect(classifyVillPresence({ vill: "villages/city_sa_riyadh" })).toBe(
      "present_path_string",
    );
    expect(
      classifyVillPresence({
        vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      }),
    ).toBe("present_document_ref");
    expect(classifyVillPresence({ vill: { foo: 1 } })).toBe(
      "unextractable_ref_shape",
    );
  });

  it("classifies region-only / display-text-only / different alias — never as vill", () => {
    expect(
      classifyVillPresence({
        cities_user_now: { path: "cities/region_sa_riyadh", id: "region_sa_riyadh" },
      }),
    ).toBe("region_ref_cities_user_now_only");
    expect(classifyVillPresence({ vill_text: "Riyadh" })).toBe(
      "display_text_only",
    );
    expect(
      classifyVillPresence({
        cityId: { path: "villages/city_sa_jeddah", id: "city_sa_jeddah" },
      }),
    ).toBe("different_alias_only");
  });

  it("Legacy proves vill optional on writers", () => {
    expect(legacyVillOptionalProven()).toBe(true);
  });
});

describe("Phase 4A-4 missing city relations — mapper never invents city", () => {
  it("absent_key → validMapped + city_not_represented — never invents from landmark name", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_no_vill",
      data: {
        ...baseOrder,
        listAmakn: [{ naim: "Riyadh Airport", Revmkan: "mkan/x" }],
      },
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(
      mapped.mappingWarnings.some((w) => w.code === "city_not_represented"),
    ).toBe(true);
    expect(mapped.model.cityId.value).toBeNull();
  });

  it("does NOT treat cities_user_now (region) as product city — still not_represented", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_region_only",
      data: {
        ...baseOrder,
        cities_user_now: {
          path: "cities/region_sa_riyadh",
          id: "region_sa_riyadh",
        },
      },
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.model.sourceCityDocumentId).toBe("");
    expect(
      mapped.mappingWarnings.some((w) => w.code === "city_not_represented"),
    ).toBe(true);
  });

  it("does NOT invent city from vill_text display string — still not_represented", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_text_only",
      data: { ...baseOrder, vill_text: "الرياض" },
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.model.cityId.value).toBeNull();
    expect(
      mapped.mappingWarnings.some((w) => w.code === "city_not_represented"),
    ).toBe(true);
  });

  it("direct vill DocumentReference maps validMapped", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_with_vill",
      data: {
        ...baseOrder,
        vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      },
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.model.cityId.value).toBe("city_sa_riyadh");
  });

  it("malformed vill shape blocks as malformed (not not_represented)", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_bad_vill",
      data: { ...baseOrder, vill: 12 },
    });
    expect(mapped.mappingStatus).toBe("malformed");
    expect(
      mapped.mappingWarnings.some((w) => w.code === "malformed_city_relation"),
    ).toBe(true);
  });

  it("different_alias_only → unmappedCity (identity exists, cannot map via vill)", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_alias_only",
      data: {
        ...baseOrder,
        cityId: { path: "villages/city_sa_jeddah", id: "city_sa_jeddah" },
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCity");
  });
});

describe("Phase 4A-4 TripGeographyDiagnostic", () => {
  it("absent_key → cityKnowledge=not_represented (FINAL POLICY)", () => {
    const data = { ...baseOrder };
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_diag_1",
      data,
    });
    const diag = buildTripGeographyDiagnostic({
      sourceDocumentId: "ord_diag_1",
      data,
      mappingStatus: mapped.mappingStatus,
      lifecycleStatus: mapped.model.lifecycleStatus,
      sourceCountryPath: mapped.model.sourceCountryPath,
      sourceCountryDocumentId: mapped.model.sourceCountryDocumentId || null,
      sourceCityPath: mapped.model.sourceCityPath,
      sourceCityDocumentId: mapped.model.sourceCityDocumentId || null,
      sourcePickupLandmarkPath: mapped.model.sourcePickupLandmarkPath,
      sourceDestinationLandmarkPath: mapped.model.sourceDestinationLandmarkPath,
    });
    expect(diag.sourceDocumentId).toBe("ord_diag_1");
    expect(diag.sourceCountryPath).toContain("countries/");
    expect(diag.sourceCityPath).toBeNull();
    expect(diag.sourcePickupLandmarkPath).toContain("mkan/");
    expect(diag.cityEvidenceKind).toBe("none");
    expect(diag.villPresenceCase).toBe("absent_key");
    expect(diag.cityKnowledge).toBe("not_represented");
    expect(diag.cityMapping).toBe("not_represented");
    expect(diag.proposedClosingBucket).toBe("legitimate_not_represented");
    expect(diag.mappingStatus).toBe("validMapped");
    // No PII keys
    expect(JSON.stringify(diag)).not.toMatch(/phone|email|address|token/i);
  });

  it("tallies geography counters: 7 not_represented vs 7 mapped", () => {
    const counters = emptyTripGeographyCounters();
    for (let i = 0; i < 7; i++) {
      const data = { ...baseOrder };
      const mapped = mapCanonicalTripFromLegacyDoc({
        documentId: `ord_miss_${i}`,
        data,
      });
      const diag = buildTripGeographyDiagnostic({
        sourceDocumentId: `ord_miss_${i}`,
        data,
        mappingStatus: mapped.mappingStatus,
        lifecycleStatus: mapped.model.lifecycleStatus,
        sourceCountryPath: mapped.model.sourceCountryPath,
        sourceCountryDocumentId: mapped.model.sourceCountryDocumentId || null,
        sourceCityPath: mapped.model.sourceCityPath,
        sourceCityDocumentId: mapped.model.sourceCityDocumentId || null,
        sourcePickupLandmarkPath: mapped.model.sourcePickupLandmarkPath,
        sourceDestinationLandmarkPath:
          mapped.model.sourceDestinationLandmarkPath,
      });
      tallyTripGeographyDiagnostic(counters, diag);
    }
    for (let i = 0; i < 7; i++) {
      const data = {
        ...baseOrder,
        vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      };
      const mapped = mapCanonicalTripFromLegacyDoc({
        documentId: `ord_ok_${i}`,
        data,
      });
      const diag = buildTripGeographyDiagnostic({
        sourceDocumentId: `ord_ok_${i}`,
        data,
        mappingStatus: mapped.mappingStatus,
        lifecycleStatus: mapped.model.lifecycleStatus,
        sourceCountryPath: mapped.model.sourceCountryPath,
        sourceCountryDocumentId: mapped.model.sourceCountryDocumentId || null,
        sourceCityPath: mapped.model.sourceCityPath,
        sourceCityDocumentId: mapped.model.sourceCityDocumentId || null,
        sourcePickupLandmarkPath: mapped.model.sourcePickupLandmarkPath,
        sourceDestinationLandmarkPath:
          mapped.model.sourceDestinationLandmarkPath,
      });
      tallyTripGeographyDiagnostic(counters, diag);
    }
    expect(counters.cityNotRepresented).toBe(7);
    expect(counters.directCityMapped).toBe(7);
    expect(counters.landmarkEvidenceCityMapped).toBe(0);
    expect(counters.cityMissingUnresolved).toBe(0);
    expect(counters.villPresenceCounts.absent_key).toBe(7);
    expect(counters.villPresenceCounts.present_document_ref).toBe(7);
  });

  it("schema pattern cohort differs primarily on villPresent", () => {
    const missing = Array.from({ length: 7 }, () =>
      buildTripGeographyDiagnostic({
        sourceDocumentId: "x",
        data: { ...baseOrder },
        mappingStatus: "validMapped",
        lifecycleStatus: "completed",
        sourceCountryPath: "countries/saudi_arabia",
        sourceCountryDocumentId: "saudi_arabia",
        sourceCityPath: null,
        sourceCityDocumentId: null,
        sourcePickupLandmarkPath: "mkan/a",
        sourceDestinationLandmarkPath: "mkan/b",
      }).schemaPattern,
    );
    const valid = Array.from({ length: 7 }, () =>
      buildTripGeographyDiagnostic({
        sourceDocumentId: "y",
        data: {
          ...baseOrder,
          vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
        },
        mappingStatus: "validMapped",
        lifecycleStatus: "completed",
        sourceCountryPath: "countries/saudi_arabia",
        sourceCountryDocumentId: "saudi_arabia",
        sourceCityPath: "villages/city_sa_riyadh",
        sourceCityDocumentId: "city_sa_riyadh",
        sourcePickupLandmarkPath: "mkan/a",
        sourceDestinationLandmarkPath: "mkan/b",
      }).schemaPattern,
    );
    const missSum = summarizeSchemaPatternCohorts(missing);
    const validSum = summarizeSchemaPatternCohorts(valid);
    expect(missSum["villPresent:false"]).toBe(7);
    expect(validSum["villPresent:true"]).toBe(7);
    expect(missSum["revDolh:true"]).toBe(7);
    expect(validSum["revDolh:true"]).toBe(7);
  });

  it("FINAL POLICY gate: cityNotRepresented does not block; unmapped/malformed do", () => {
    expect(
      tripCityClosingBucketsAllowClose([
        "mapped",
        "legitimate_not_represented",
        "testOrNoncanonical",
      ]),
    ).toBe(true);
    expect(
      tripCityClosingBucketsAllowClose(["mapped", "unmapped"]),
    ).toBe(false);
    // Live close allows not_represented when unmappedCity=0
    expect(
      tripMappingReadyForLiveClose(
        {
          recordsRead: 14,
          validMapped: 14,
          unmappedCountry: 0,
          unmappedCity: 0,
          unmappedStatus: 0,
          ambiguousCountry: 0,
          ambiguousCity: 0,
          malformed: 0,
          testOrNoncanonical: 0,
          unknownCustomerReference: 0,
          unknownDriverReference: 0,
          unknownLifecycleStatus: 0,
          conflictingLifecycleStatus: 0,
          financialUnknown: 0,
          financialConflicting: 0,
          financialPersistedComplete: 14,
          financialAmountUnknown: 0,
          financialRateUnknown: 0,
          financialNotRepresented: 14,
          financialDerived: 0,
          exactCanonicalDuplicates: 0,
          sameIdOrderAliasDuplicates: 0,
          semanticCustomerTimeDuplicates: 0,
          semanticDuplicates: 0,
          activeOperationalDuplicates: 0,
          hits: [],
        },
        { cityNotRepresented: 7, cityMissingUnresolved: 0 },
      ),
    ).toBe(true);
    // cityMissingUnresolved still blocks
    expect(
      tripMappingReadyForLiveClose(
        {
          recordsRead: 14,
          validMapped: 14,
          unmappedCountry: 0,
          unmappedCity: 0,
          unmappedStatus: 0,
          ambiguousCountry: 0,
          ambiguousCity: 0,
          malformed: 0,
          testOrNoncanonical: 0,
          unknownCustomerReference: 0,
          unknownDriverReference: 0,
          unknownLifecycleStatus: 0,
          conflictingLifecycleStatus: 0,
          financialUnknown: 0,
          financialConflicting: 0,
          financialPersistedComplete: 14,
          financialAmountUnknown: 0,
          financialRateUnknown: 0,
          financialNotRepresented: 14,
          financialDerived: 0,
          exactCanonicalDuplicates: 0,
          sameIdOrderAliasDuplicates: 0,
          semanticCustomerTimeDuplicates: 0,
          semanticDuplicates: 0,
          activeOperationalDuplicates: 0,
          hits: [],
        },
        { cityNotRepresented: 0, cityMissingUnresolved: 1 },
      ),
    ).toBe(false);
    // unmappedCity still blocks
    expect(
      tripMappingReadyForLiveClose(
        {
          recordsRead: 14,
          validMapped: 7,
          unmappedCountry: 0,
          unmappedCity: 7,
          unmappedStatus: 0,
          ambiguousCountry: 0,
          ambiguousCity: 0,
          malformed: 0,
          testOrNoncanonical: 0,
          unknownCustomerReference: 0,
          unknownDriverReference: 0,
          unknownLifecycleStatus: 0,
          conflictingLifecycleStatus: 0,
          financialUnknown: 0,
          financialConflicting: 0,
          financialPersistedComplete: 14,
          financialAmountUnknown: 0,
          financialRateUnknown: 0,
          financialNotRepresented: 14,
          financialDerived: 0,
          exactCanonicalDuplicates: 0,
          sameIdOrderAliasDuplicates: 0,
          semanticCustomerTimeDuplicates: 0,
          semanticDuplicates: 0,
          activeOperationalDuplicates: 0,
          hits: [],
        },
        { cityNotRepresented: 0, cityMissingUnresolved: 0 },
      ),
    ).toBe(false);
  });
});

describe("Phase 4A-4 financial_safe_read_warning vs counters", () => {
  it("rate not_represented emits precise warnings but financialUnknown stays 0", () => {
    const fin = mapTripFinancialSafeRead({
      documentId: "ord_fin",
      data: {
        total_app: 7.5,
        total_vat: 0,
        total_mndob: 42.5,
        total_mndob2: 50,
        currency: "SAR",
      },
    });
    expect(fin.vatRateKnowledge).toBe("not_represented");
    expect(fin.platformCommissionRateKnowledge).toBe("not_represented");
    expect(fin.warnings).toContain("vat_rate_not_snapshotted");
    expect(fin.warnings).toContain("platform_commission_rate_not_snapshotted");
    expect(fin.totalAppKnowledge).toBe("persisted");
    // Amounts known → not unknown
    expect(
      [fin.totalAppKnowledge, fin.totalVatKnowledge, fin.totalMndobKnowledge].some(
        (k) => k === "unknown",
      ),
    ).toBe(false);
  });

  it("mapper emits precise financial warning codes (not suppressed)", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_fin_warn",
      data: {
        ...baseOrder,
        vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
        currency: "SAR",
      },
    });
    const codes = mapped.mappingWarnings.map((w) => w.code);
    expect(codes).toContain("vat_rate_not_snapshotted");
    expect(codes).toContain("platform_commission_rate_not_snapshotted");
    // Generic financial_safe_read_warning may still appear for other messages
    expect(codes.some((c) => c.includes("rate_not_snapshotted"))).toBe(true);
  });

  it("repository splits financial counters: notRepresented vs unknown", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    client.seed("order", [
      {
        id: "ord_fin_repo",
        data: {
          ...baseOrder,
          vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
          currency: "SAR",
          data_order: "2026-09-10T08:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.auditMetrics.recordsRead).toBe(1);
    expect(page.auditMetrics.financialUnknown).toBe(0);
    expect(page.auditMetrics.financialConflicting).toBe(0);
    expect(page.auditMetrics.financialNotRepresented).toBe(1);
    expect(page.auditMetrics.financialPersistedComplete).toBe(1);
    expect(page.auditMetrics.financialAmountUnknown).toBe(0);
    expect(page.geographyCounters.directCityMapped).toBe(1);
  });
});

describe("Phase 4A-4 Fake cohort mirroring live 7/14 city gap", () => {
  it("Fake page: 7 mapped + 7 not_represented → unmappedCity=0, gate ready, firestoreQueries=1", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    const docs = [];
    for (let i = 0; i < 7; i++) {
      docs.push({
        id: `fake_ok_${i}`,
        data: {
          ...baseOrder,
          vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
          currency: "SAR",
          data_order: "2026-09-10T08:00:00.000Z",
        },
      });
    }
    for (let i = 0; i < 7; i++) {
      docs.push({
        id: `fake_miss_${i}`,
        data: {
          ...baseOrder,
          currency: "SAR",
          data_order: "2026-09-10T09:00:00.000Z",
          created_by_function: true,
        },
      });
    }
    client.seed("order", docs);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.auditMetrics.recordsRead).toBe(14);
    expect(page.auditMetrics.validMapped).toBe(14);
    expect(page.auditMetrics.unmappedCity).toBe(0);
    expect(page.geographyCounters.directCityMapped).toBe(7);
    expect(page.geographyCounters.cityNotRepresented).toBe(7);
    expect(page.geographyCounters.cityMissingUnresolved).toBe(0);
    expect(page.geographyCounters.landmarkEvidenceCityMapped).toBe(0);
    expect(page.tripGeographyDiagnostics.length).toBe(7);
    expect(
      page.tripGeographyDiagnostics.every((d) => d.villPresenceCase === "absent_key"),
    ).toBe(true);
    expect(
      page.tripGeographyDiagnostics.every(
        (d) => d.proposedClosingBucket === "legitimate_not_represented",
      ),
    ).toBe(true);
    expect(
      page.tripGeographyDiagnostics.every((d) => d.cityKnowledge === "not_represented"),
    ).toBe(true);
    expect(client.queryLog.length).toBe(1);
    expect(
      tripMappingReadyForLiveClose(page.auditMetrics, page.geographyCounters),
    ).toBe(true);
  });
});
