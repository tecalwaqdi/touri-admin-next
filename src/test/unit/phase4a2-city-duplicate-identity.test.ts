/**
 * Phase 4A-2 — City duplicate identity audit (Fake/unit).
 * NO Production Firebase calls.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetEnvCache, getEnv } from "@/config/env";
import { mapCityFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  FirebaseProductionGeographyReadRepository,
} from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";
import {
  auditCityDuplicateIdentity,
  cityMappingReadyForLiveClose,
  isLegacyAfricaCompatCityId,
  isLegacyIntlAliasCityId,
  normalizeSafeName,
} from "@/domain/geography/CityDuplicateIdentityAudit";

function ctx(): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a2-dup",
    permissions: ["geography:read"],
    requestId: "req-4a2-dup",
    correlationId: "corr-4a2-dup",
  };
}

const saAliases: CityAliasEntry[] = [
  {
    aliasId: "city_riyadh",
    canonicalCityId: "city_sa_riyadh",
    countryId: "saudi_arabia",
    confidence: "high",
    evidence: "test",
  },
  {
    aliasId: "city_alkhobar",
    canonicalCityId: "city_sa_khobar",
    countryId: "saudi_arabia",
    confidence: "high",
    evidence: "test",
  },
  {
    aliasId: "city_khobar",
    canonicalCityId: "city_sa_khobar",
    countryId: "saudi_arabia",
    confidence: "high",
    evidence: "test",
  },
];

describe("Phase 4A-2 sourceDocumentId vs canonicalCityId", () => {
  it("preserves sourceDocumentId distinct from remapped canonicalCityId", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: "city_riyadh",
      data: {
        naim: "الرياض",
        dolh: "countries/saudi_arabia",
        cities: "cities/region_sa_riyadh",
        acctev: true,
      },
      aliases: saAliases,
    });
    expect(mapped.sourceDocumentId).toBe("city_riyadh");
    expect(mapped.canonicalCityId).toBe("city_sa_riyadh");
    expect(mapped.id).toBe("city_sa_riyadh");
    expect(mapped.sourceDocumentId).not.toBe(mapped.canonicalCityId);
  });

  it("keeps sourceDocumentId === canonicalCityId when already canonical", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: "city_sa_riyadh",
      data: {
        naim: "الرياض",
        dolh: "countries/saudi_arabia",
        acctev: true,
      },
      aliases: saAliases,
    });
    expect(mapped.sourceDocumentId).toBe("city_sa_riyadh");
    expect(mapped.canonicalCityId).toBe("city_sa_riyadh");
  });
});

describe("Phase 4A-2 exact canonicalCityId collisions", () => {
  it("two source docs → same canonical ID form exact duplicate group", () => {
    const a = mapCityFromLegacyDoc({
      documentId: "city_riyadh",
      data: {
        naim: "الرياض",
        dolh: "countries/saudi_arabia",
        acctev: true,
      },
      aliases: saAliases,
    });
    const b = mapCityFromLegacyDoc({
      documentId: "city_sa_riyadh",
      data: {
        naim: "الرياض",
        dolh: "countries/saudi_arabia",
        acctev: true,
      },
      aliases: saAliases,
    });
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: a.sourceDocumentId,
        canonicalCityId: a.canonicalCityId,
        safeName: a.safeName,
        countryId: a.countryId,
        regionId: a.regionId,
        activeStatus: a.activeStatus,
        mappingStatus: a.mappingStatus,
      },
      {
        sourceDocumentId: b.sourceDocumentId,
        canonicalCityId: b.canonicalCityId,
        safeName: b.safeName,
        countryId: b.countryId,
        regionId: b.regionId,
        activeStatus: b.activeStatus,
        mappingStatus: b.mappingStatus,
      },
    ]);
    expect(audit.exactCanonicalDuplicates).toBe(1);
    expect(audit.exactCanonicalIdDuplicateGroups[0]?.key).toBe("city_sa_riyadh");
    expect(
      audit.exactCanonicalIdDuplicateGroups[0]?.members.map(
        (m) => m.sourceDocumentId,
      ),
    ).toEqual(["city_riyadh", "city_sa_riyadh"]);
    expect(audit.activeOperationalDuplicates).toBe(1);
    expect(audit.activeActiveDuplicateGroups).toHaveLength(1);
  });

  it("khobar triple alias sources → one exact group with 3 sources", () => {
    const docs = ["city_alkhobar", "city_khobar", "city_sa_khobar"];
    const rows = docs.map((id) => {
      const m = mapCityFromLegacyDoc({
        documentId: id,
        data: {
          naim: "الخبر",
          dolh: "countries/saudi_arabia",
          acctev: true,
        },
        aliases: saAliases,
      });
      return {
        sourceDocumentId: m.sourceDocumentId,
        canonicalCityId: m.canonicalCityId,
        safeName: m.safeName,
        countryId: m.countryId,
        regionId: m.regionId,
        activeStatus: m.activeStatus,
        mappingStatus: m.mappingStatus,
      };
    });
    const audit = auditCityDuplicateIdentity(rows);
    expect(audit.exactCanonicalDuplicates).toBe(1);
    expect(audit.exactCanonicalIdDuplicateGroups[0]?.members).toHaveLength(3);
    expect(
      rows.every((r) => r.canonicalCityId === "city_sa_khobar"),
    ).toBe(true);
  });
});

describe("Phase 4A-2 semantic duplicates", () => {
  it("same name different countries are NOT duplicates", () => {
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: "city_a",
        canonicalCityId: "city_a",
        safeName: "Springfield",
        countryId: "usa_fake",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
      {
        sourceDocumentId: "city_b",
        canonicalCityId: "city_b",
        safeName: "Springfield",
        countryId: "canada_fake",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
    ]);
    // countryIds are unmapped in real mapper; here we only test audit keying
    expect(audit.semanticDuplicates).toBe(0);
    expect(audit.exactCanonicalDuplicates).toBe(0);
    expect(audit.activeOperationalDuplicates).toBe(0);
  });

  it("same name/country different proven regions are NOT semantic duplicates", () => {
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: "city_east",
        canonicalCityId: "city_east",
        safeName: "Alexandria",
        countryId: "egypt_fake",
        regionId: "region_east",
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
      {
        sourceDocumentId: "city_west",
        canonicalCityId: "city_west",
        safeName: "Alexandria",
        countryId: "egypt_fake",
        regionId: "region_west",
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
    ]);
    expect(audit.semanticDuplicates).toBe(0);
    expect(audit.activeOperationalDuplicates).toBe(0);
  });

  it("intl capital + city_sa_{iso}_ shadow → semantic duplicate group", () => {
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: "city_my_kuala_lumpur",
        canonicalCityId: "city_my_kuala_lumpur",
        safeName: "Kuala Lumpur",
        countryId: "malaysia",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
      {
        sourceDocumentId: "city_sa_my_kuala_lumpur",
        canonicalCityId: "city_sa_my_kuala_lumpur",
        safeName: "Kuala Lumpur",
        countryId: "malaysia",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
    ]);
    expect(audit.semanticDuplicates).toBe(1);
    expect(audit.exactCanonicalDuplicates).toBe(0);
    expect(audit.activeOperationalDuplicates).toBe(1);
    expect(isLegacyIntlAliasCityId("city_sa_my_kuala_lumpur")).toBe(true);
    expect(isLegacyAfricaCompatCityId("city_sa_ng_abuja")).toBe(true);
  });
});

describe("Phase 4A-2 active/inactive duplicate classification", () => {
  it("active+inactive classified separately; does not block as activeOperational", () => {
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: "city_legacy",
        canonicalCityId: "city_sa_taif",
        safeName: "الطائف",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "inactive",
        mappingStatus: "validMapped",
      },
      {
        sourceDocumentId: "city_sa_taif",
        canonicalCityId: "city_sa_taif",
        safeName: "الطائف",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
    ]);
    expect(audit.exactCanonicalDuplicates).toBe(1);
    expect(audit.activeInactiveDuplicateGroups).toHaveLength(1);
    expect(audit.activeActiveDuplicateGroups).toHaveLength(0);
    expect(audit.activeOperationalDuplicates).toBe(0);
    expect(
      cityMappingReadyForLiveClose({
        unmappedCountry: 0,
        ambiguousCountry: 0,
        malformed: 0,
        activeOperationalDuplicates: audit.activeOperationalDuplicates,
      }),
    ).toBe(true);
  });

  it("active+active blocks readiness gate", () => {
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: "city_a",
        canonicalCityId: "city_x",
        safeName: "X",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
      {
        sourceDocumentId: "city_b",
        canonicalCityId: "city_x",
        safeName: "X",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
    ]);
    expect(audit.activeOperationalDuplicates).toBe(1);
    expect(
      cityMappingReadyForLiveClose({
        unmappedCountry: 0,
        ambiguousCountry: 0,
        malformed: 0,
        activeOperationalDuplicates: audit.activeOperationalDuplicates,
      }),
    ).toBe(false);
  });

  it("inactive+inactive reported but does not block readiness", () => {
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: "old_1",
        canonicalCityId: "city_old",
        safeName: "Old",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "inactive",
        mappingStatus: "validMapped",
      },
      {
        sourceDocumentId: "old_2",
        canonicalCityId: "city_old",
        safeName: "Old",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "inactive",
        mappingStatus: "validMapped",
      },
    ]);
    expect(audit.inactiveInactiveDuplicateGroups).toHaveLength(1);
    expect(audit.activeOperationalDuplicates).toBe(0);
    expect(
      cityMappingReadyForLiveClose({
        unmappedCountry: 0,
        ambiguousCountry: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
      }),
    ).toBe(true);
  });
});

describe("Phase 4A-2 CP5 excluded from operational duplicates", () => {
  it("CP5 test village does not inflate operational duplicate metrics", () => {
    const audit = auditCityDuplicateIdentity([
      {
        sourceDocumentId: "cp5_vill_1",
        canonicalCityId: "cp5_vill_1",
        safeName: "FUNCTIONAL TEST VILLAGE",
        countryId: "cp5_country_1",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "testOrNoncanonical",
      },
      {
        sourceDocumentId: "cp5_vill_2",
        canonicalCityId: "cp5_vill_1",
        safeName: "FUNCTIONAL TEST VILLAGE",
        countryId: "cp5_country_1",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "testOrNoncanonical",
      },
      {
        sourceDocumentId: "city_sa_jeddah",
        canonicalCityId: "city_sa_jeddah",
        safeName: "جدة",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
      },
    ]);
    expect(audit.exactCanonicalDuplicates).toBe(0);
    expect(audit.semanticDuplicates).toBe(0);
    expect(audit.activeOperationalDuplicates).toBe(0);
  });
});

describe("Phase 4A-2 listCities duplicate stats wiring", () => {
  it("repository surfaces exact/semantic/activeOperational duplicate stats", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("villages", [
      {
        id: "city_riyadh",
        data: {
          naim: "الرياض",
          dolh: "countries/saudi_arabia",
          acctev: true,
        },
      },
      {
        id: "city_sa_riyadh",
        data: {
          naim: "الرياض",
          dolh: "countries/saudi_arabia",
          acctev: true,
        },
      },
      {
        id: "city_my_kuala_lumpur",
        data: {
          naim: "Kuala Lumpur",
          dolh: "countries/malaysia",
          acctev: true,
        },
      },
      {
        id: "city_sa_my_kuala_lumpur",
        data: {
          naim: "Kuala Lumpur",
          dolh: "countries/malaysia",
          acctev: true,
        },
      },
      {
        id: "cp5_vill_9",
        data: {
          naim: "FUNCTIONAL TEST VILLAGE",
          dolh: "countries/cp5_country_9",
          acctev: true,
          functional_test: true,
          functional_test_checkpoint: "ADMIN_CP5",
        },
      },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["cities"]),
      aliases: saAliases,
    });
    const page = await geo.listCities(ctx(), {}, { limit: 50 });
    expect(page.items).toHaveLength(5);
    const riyadh = page.items.filter(
      (i) => i.data.canonicalCityId === "city_sa_riyadh",
    );
    expect(riyadh).toHaveLength(2);
    expect(new Set(riyadh.map((i) => i.data.sourceDocumentId))).toEqual(
      new Set(["city_riyadh", "city_sa_riyadh"]),
    );

    const stats = geo.lastCityMappingStats!;
    expect(stats.exactCanonicalDuplicates).toBe(1);
    expect(stats.semanticDuplicates).toBe(1);
    expect(stats.activeOperationalDuplicates).toBe(2);
    expect(stats.testOrNoncanonical).toBe(1);
    expect(geo.lastCityDuplicateAudit?.exactCanonicalIdDuplicateGroups).toHaveLength(
      1,
    );
    expect(
      cityMappingReadyForLiveClose({
        unmappedCountry: stats.unmappedCountry,
        ambiguousCountry: stats.ambiguousCountry,
        malformed: stats.malformed,
        activeOperationalDuplicates: stats.activeOperationalDuplicates,
      }),
    ).toBe(false);
  });
});

describe("Phase 4A-2 normalizeSafeName", () => {
  it("collapses whitespace and case for semantic keys", () => {
    expect(normalizeSafeName("  Kuala   Lumpur ")).toBe("kuala lumpur");
  });
});

describe("Phase 4A-2 defaults still disabled", () => {
  beforeEach(() => resetEnvCache());
  it("Production Read/Write remain disabled", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
  });
});
