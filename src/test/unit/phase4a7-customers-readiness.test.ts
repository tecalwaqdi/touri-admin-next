/**
 * Phase 4A-7 — Customers Fake/unit readiness suite.
 * NO Production Firebase calls. FULL_PII_SHADOW_ENABLED=false. All write flags false.
 * CUSTOMER_WRITE_ENABLED=false. No create / activate / suspend / delete / wallet.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetEnvCache, getEnv } from "@/config/env";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import {
  LiveResourceNotEnabledError,
  parseLiveShadowAllowedResources,
  PHASE_4A7_LIVE_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { mapCanonicalCustomerFromLegacyDoc } from "@/domain/customer/mapCanonicalCustomerRead";
import { mapCustomerAccountState } from "@/domain/customer/CustomerAccountSemantics";
import {
  CUSTOMER_FINANCIAL_FIELD_NOTES,
  summarizeCustomerFinancialPresence,
} from "@/domain/customer/CustomerFinancialFieldNotes";
import {
  auditCustomerDuplicates,
  customerMappingReadyForLiveClose,
  hashCustomerEmailForAudit,
  hashCustomerPhoneForAudit,
  isTestOrNoncanonicalCustomer,
  reconcileCustomerAuditPartition,
  rowFromCanonicalCustomer,
} from "@/domain/customer/CustomerDuplicateIdentityAudit";
import {
  customerLiveClosingGatesPass,
  customerLiveReportHasSensitiveLeak,
  excludedNonCustomerHasAuthoritativeEvidence,
  formatCustomerMappingNoGoMessage,
  selectCustomerDiagnosticsForLiveSummary,
} from "@/domain/customer/CustomerMappingDiagnostic";
import {
  classifyCustomerMembership,
  classifyContaminatingNonCustomerIdentity,
  hasPositiveCustomerEvidence,
} from "@/domain/customer/CustomerRoleClassification";
import {
  maskCustomerEmailHint,
  maskCustomerPhoneHint,
} from "@/domain/customer/CustomerContactHints";
import { isPhase4A7LiveCustomersEnabled } from "@/domain/customer/isPhase4A7LiveCustomersEnabled";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import {
  FirebaseProductionCustomerReadRepository,
  PHASE_4A7_CUSTOMERS_MAX_PAGE,
  PHASE_4A7_CUSTOMER_DISCRIMINATOR_KIND,
  PHASE_4A7_CUSTOMER_ORDER_FIELD,
  PHASE_4A7_CUSTOMER_TIMESTAMP_FIELD,
} from "@/infrastructure/production/repositories/FirebaseProductionCustomerReadRepository";
import {
  CUSTOMER_QUERY_INDEX_DEPENDENCY_BLOCKER,
  classifyCustomerLiveQueryFailure,
} from "@/domain/customer/CustomerLiveQueryFailure";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { SENSITIVE_FIELD_REGISTRY } from "@/domain/read/SensitiveFieldRegistry";
import { isCollectionAllowedForProductionRead } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";
import { assertProductionWriteAllowed } from "@/config/safety";
import { isDocumentIdOrderField } from "@/infrastructure/production/firestore/FirestoreReadClient";

function ctx(
  overrides?: Partial<ProductionReadContext>,
): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a7",
    permissions: ["customers:read"],
    requestId: "req-4a7",
    correlationId: "corr-4a7",
    ...overrides,
  };
}

const liveCustomersStartupBase = {
  PRODUCTION_READ_ENABLED: true,
  PRODUCTION_READ_MODE: "shadow" as const,
  AUTH_MODE: "verified_token" as const,
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  PRODUCTION_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  FULL_PII_SHADOW_ENABLED: false,
  LIVE_SHADOW_ALLOWED_RESOURCES: "customers",
  PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const,
};

const approvedCustomerSa = {
  id: "cust_sa_001",
  data: {
    uid: "cust_sa_001",
    actev_user: true,
    display_name: "Customer SA",
    Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
    phone_number: "+966501112233",
    email: "oscar@example.com",
    Bookings_User: 3,
    created_time: "2026-09-01T10:00:00.000Z",
  },
};

describe("Phase 4A-7 defaults + startup", () => {
  beforeEach(() => resetEnvCache());

  it("Production Read remains disabled by default", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);
    expect(env.CUSTOMER_WRITE_ENABLED).toBe(false);
  });

  it("startup accepts customers-only live window", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow(liveCustomersStartupBase),
    ).not.toThrow();
    expect(PHASE_4A7_LIVE_RESOURCES).toEqual(["customers"]);
  });

  it("startup rejects CUSTOMER_WRITE_ENABLED=true", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveCustomersStartupBase,
        CUSTOMER_WRITE_ENABLED: true,
      }),
    ).toThrow(/CUSTOMER_WRITE_ENABLED/);
  });

  it("startup rejects FULL_PII_SHADOW_ENABLED=true", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveCustomersStartupBase,
        FULL_PII_SHADOW_ENABLED: true,
      }),
    ).toThrow(/FULL_PII_SHADOW/);
  });

  it("startup rejects agents+customers multi-resource allowlist", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveCustomersStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "agents,customers",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("isPhase4A7LiveCustomersEnabled only accepts exact 1", () => {
    expect(isPhase4A7LiveCustomersEnabled(undefined)).toBe(false);
    expect(isPhase4A7LiveCustomersEnabled("")).toBe(false);
    expect(isPhase4A7LiveCustomersEnabled("0")).toBe(false);
    expect(isPhase4A7LiveCustomersEnabled("true")).toBe(false);
    expect(isPhase4A7LiveCustomersEnabled("1")).toBe(true);
  });
});

describe("Phase 4A-7 authoritative source + exclusionary membership", () => {
  it("collection allowlist includes shared user", () => {
    expect(isCollectionAllowedForProductionRead("user")).toBe(true);
  });

  it("discriminator is exclusionary — no is_customer field", () => {
    expect(PHASE_4A7_CUSTOMER_DISCRIMINATOR_KIND).toBe(
      "exclusionary_non_driver_non_agent",
    );
    const c = classifyCustomerMembership({
      actev_user: true,
      display_name: "A",
    });
    expect(c.isCustomerCandidate).toBe(true);
    expect(c.discriminatorKind).toBe("exclusionary_non_driver_non_agent");
    expect(c.isOperationalCustomer).toBe(true);
  });

  it("does not invent is_customer positive filter", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "x",
      data: { is_customer: true, actev_user: true },
    });
    // is_customer alone is ignored — still candidate via exclusion
    expect(mapped.model.discriminatorKind).toBe(
      "exclusionary_non_driver_non_agent",
    );
  });

  it("driver ismndob → excludedNonCustomer not customer", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "d1",
      data: {
        ismndob: true,
        actev_mndob: true,
        Rev_dolh: { path: "countries/saudi_arabia" },
      },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("driver");
    expect(mapped.model.isOperationalCustomer).toBe(false);
  });

  it("driver ismndom alias → excludedNonCustomer", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "d2",
      data: { ismndom: true, phone_number: "+966500000001" },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("driver");
  });

  it("agent Isagent → excludedNonCustomer", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "a1",
      data: {
        Isagent: true,
        isAdminRule: 2,
        Rev_dloh_agent: { path: "countries/saudi_arabia" },
      },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("agent");
  });

  it("lowercase isagent → excludedNonCustomer", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "a2",
      data: { isagent: true, actev_user: true },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("agent");
  });
});

describe("Phase 4A-7 role contamination (shared user)", () => {
  it("SUPERADMIN without driver/agent flags → excludedNonCustomer not geography", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "admin1",
      data: {
        IsAdmin: true,
        isAdminRule: 1,
        actev_user: true,
        email: "admin@example.com",
      },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("super_admin");
    expect(mapped.model.geographyRepresentation).toBe("not_applicable");
  });

  it("finance isAdminRule=5 → excludedNonCustomer", () => {
    expect(
      classifyContaminatingNonCustomerIdentity({ isAdminRule: 5 })
        .isContaminatingNonCustomerIdentity,
    ).toBe(true);
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "fin1",
      data: { isAdminRule: 5, actev_user: true },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("finance");
  });

  it("country_admin isAdminRule=2 → excludedNonCustomer (unlike Agents)", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "ca1",
      data: { isAdminRule: 2, actev_user: true, display_name: "CA" },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("country_admin");
  });

  it("partner / transport / tour_guide → excludedNonCustomer", () => {
    expect(
      mapCanonicalCustomerFromLegacyDoc({
        documentId: "p1",
        data: { is_partner: true, actev_user: true },
      }).model.authoritativeRole,
    ).toBe("partner");
    expect(
      mapCanonicalCustomerFromLegacyDoc({
        documentId: "t1",
        data: { isAdminRule: 4, actev_user: true },
      }).model.authoritativeRole,
    ).toBe("transport");
    expect(
      mapCanonicalCustomerFromLegacyDoc({
        documentId: "g1",
        data: { is_tour_guide: true, actev_user: true },
      }).model.authoritativeRole,
    ).toBe("tour_guide");
  });
});

describe("Phase 4A-7 positive evidence + excludedUnknownIdentity", () => {
  it("exclusion alone is NOT positive Customer evidence", () => {
    const c = classifyCustomerMembership({});
    expect(c.isCustomerCandidate).toBe(true);
    expect(c.hasPositiveCustomerEvidence).toBe(false);
    expect(c.isOperationalCustomer).toBe(false);
    expect(hasPositiveCustomerEvidence({}).proven).toBe(false);
  });

  it("signup actev_user / phone / email → positive evidence → operational", () => {
    const c = classifyCustomerMembership({
      actev_user: true,
      phone_number: "+966500000000",
      email: "c@example.com",
      display_name: "Cust",
      created_time: "2024-01-01T00:00:00.000Z",
    });
    expect(c.hasPositiveCustomerEvidence).toBe(true);
    expect(c.isOperationalCustomer).toBe(true);
    expect(c.authoritativeRole).toBe("customer");
  });

  it("uid alone is identity not Customer proof → excludedUnknownIdentity", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "stub1",
      data: { uid: "stub1" },
    });
    expect(mapped.model.isCustomerCandidate).toBe(true);
    expect(mapped.model.hasPositiveCustomerEvidence).toBe(false);
    expect(mapped.model.isOperationalCustomer).toBe(false);
    expect(mapped.model.mappingStatus).toBe("excludedUnknownIdentity");
    expect(mapped.model.authoritativeRole).toBe("unknown");
    expect(mapped.model.geographyRepresentation).toBe("not_applicable");
    expect(mapped.model.accountState).toBe("unknown");
  });

  it("missing Rev_dolh on unknown identity does NOT increment unmappedCountry", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "unk_geo",
      data: { preferred_locale: "ar" },
    });
    expect(mapped.model.mappingStatus).toBe("excludedUnknownIdentity");
    expect(mapped.model.mappingStatus).not.toBe("unmappedCountry");
    expect(mapped.model.mappingStatus).not.toBe("unknownDiscriminator");
    expect(mapped.model.mappingStatus).not.toBe("geographyNotRepresented");
  });

  it("inventory DRIVER evidence (ismndob) → excludedNonCustomer not unknown", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "drv_inv",
      data: { ismndob: true, registration_status: "approved" },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("driver");
  });

  it("inventory SUPERADMIN (IsAdmin) → excludedNonCustomer", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "sa_inv",
      data: { IsAdmin: true, isAdminRule: 1 },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonCustomer");
    expect(mapped.model.authoritativeRole).toBe("super_admin");
  });

  it("prior live unknownDiscriminator shape (7) → excludedUnknownIdentity via evidence rules", () => {
    // Same evidence shape as live NO-GO rows: exclusionary candidate, no
    // signup/inventory CUSTOMER residual fields, missing Rev_dolh, unknown account.
    // Do NOT hardcode UIDs as Customer — classify by rules only.
    const priorLiveIds = [
      "3NEQg1BjO7cf1VEBMyBOUjZplOm2",
      "4j7vBIU392RL94ncZlmPQR81WJj1",
      "6X0FzrjiiofFDxr5Uypsy0sJpSA3",
      "CT2QJiB1wPdgs0BhOOIQ9tzO36f1",
      "JAsiOGQIlVcYkGkgGNDRzCzT22l2",
      "P1BTGrbNOrZCeKPEClXbo7LSA2O2",
      "R1INH7tuV9YFy8MtClTi8CVLAGt1",
    ];
    const rows = priorLiveIds.map((id) =>
      rowFromCanonicalCustomer(
        mapCanonicalCustomerFromLegacyDoc({
          documentId: id,
          data: { uid: id },
        }).model,
      ),
    );
    for (const r of rows) {
      expect(r.mappingStatus).toBe("excludedUnknownIdentity");
      expect(r.hasPositiveCustomerEvidence).toBe(false);
      expect(r.isOperationalCustomer).toBe(false);
      expect(r.unmappedCountry).toBe(false);
    }
    const metrics = auditCustomerDuplicates(rows);
    expect(metrics.excludedUnknownIdentity).toBe(7);
    expect(metrics.unknownDiscriminator).toBe(0);
    expect(metrics.unmappedCountry).toBe(0);
    expect(reconcileCustomerAuditPartition(metrics).ok).toBe(true);

    const diags = selectCustomerDiagnosticsForLiveSummary(
      priorLiveIds.map(
        (id) =>
          mapCanonicalCustomerFromLegacyDoc({
            documentId: id,
            data: { uid: id },
          }).model,
      ),
    );
    expect(diags).toHaveLength(7);
    expect(
      diags.every(
        (d) =>
          d.mappingStatus === "excludedUnknownIdentity" &&
          d.testClassification === "excludedUnknownIdentity" &&
          d.countryMapping === "excludedUnknownIdentity" &&
          d.authoritativeRole === "unknown" &&
          d.hasPositiveCustomerEvidence === false,
      ),
    ).toBe(true);
  });

  it("does not invent is_customer; is_customer alone is not positive evidence", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "fake",
      data: { is_customer: true },
    });
    expect(mapped.model.hasPositiveCustomerEvidence).toBe(false);
    expect(mapped.model.mappingStatus).toBe("excludedUnknownIdentity");
  });

  it("proven operational Customer with invalid Rev_dolh stays unmappedCountry (not hidden)", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "bad_geo",
      data: {
        actev_user: true,
        display_name: "Real Cust",
        Rev_dolh: { path: "countries/not_a_real_country_zz", id: "not_a_real_country_zz" },
      },
    });
    expect(mapped.model.isOperationalCustomer).toBe(true);
    expect(mapped.model.mappingStatus).toBe("unmappedCountry");
  });
});

describe("Phase 4A-7 identity + PII redaction", () => {
  it("sourceDocumentId vs authUid mismatch recorded", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "doc1",
      data: {
        uid: "other_uid",
        actev_user: true,
        Rev_dolh: { path: "countries/saudi_arabia" },
      },
    });
    expect(mapped.model.sourceDocumentId).toBe("doc1");
    expect(mapped.model.authUid).toBe("other_uid");
    expect(mapped.model.authUidKnowledge).toBe("mismatch");
  });

  it("masks phone as ***1234 and email as os***@example.com", () => {
    expect(maskCustomerPhoneHint("+966501112233")).toBe("***2233");
    expect(maskCustomerEmailHint("oscar@example.com")).toBe("os***@example.com");
  });

  it("canonical model never carries raw phone/email in values or provenance", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c1",
      data: approvedCustomerSa.data,
    });
    const serialized = JSON.stringify(mapped.model);
    expect(serialized).not.toContain("+966501112233");
    expect(serialized).not.toContain("oscar@example.com");
    expect(mapped.model.phone.value).toBe("***2233");
    expect(mapped.model.email.value).toBe("os***@example.com");
    expect(mapped.model.phone.provenance.sourceValue).toBe("***2233");
    expect(mapped.model.email.provenance.sourceValue).toBe("os***@example.com");
  });

  it("FULL_PII_SHADOW_ENABLED=false traps allowFullPii", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [{ id: "c1", data: approvedCustomerSa.data }]);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      fullPiiShadowEnabled: false,
    });
    await expect(
      repos.customers.getSummaryById(
        ctx({ allowFullPii: true, permissions: ["customers:read_pii"] }),
        "c1",
      ),
    ).rejects.toThrow(/FULL_PII|PII/);
  });

  it("sensitive registry covers customer phone/email/address/fcm", () => {
    const fields = SENSITIVE_FIELD_REGISTRY.filter(
      (r) => r.resource === "customer",
    ).map((r) => r.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "phone",
        "email",
        "phone_number",
        "address",
        "adresslist",
        "fcm_token",
        "password",
      ]),
    );
  });
});

describe("Phase 4A-7 account vs Auth + geography", () => {
  it("actev_user true/false/missing → enabled/disabled/unknown", () => {
    expect(mapCustomerAccountState({ actev_user: true })).toBe("enabled");
    expect(mapCustomerAccountState({ actev_user: false })).toBe("disabled");
    expect(mapCustomerAccountState({})).toBe("unknown");
  });

  it("authEnabled and emailVerified remain not_queried", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c1",
      data: approvedCustomerSa.data,
    });
    expect(mapped.model.authEnabledKnowledge).toBe("not_queried");
    expect(mapped.model.authEmailVerifiedKnowledge).toBe("not_queried");
    expect(mapped.model.verification.value).toBeNull();
  });

  it("Rev_dolh maps via CLOSED country map", () => {
    expect(resolveCanonicalCountryId("saudi_arabia").status).toBe("mapped");
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c1",
      data: approvedCustomerSa.data,
    });
    expect(mapped.model.countryId.value).toBeTruthy();
    expect(mapped.model.countrySourcePath).toContain("countries/");
    expect(mapped.model.mappingStatus).toBe("validMapped");
  });

  it("missing Rev_dolh on operational customer → geographyNotRepresented", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c_new",
      data: {
        uid: "c_new",
        actev_user: true,
        display_name: "New Signup",
        phone_number: "+966509998877",
        // signup often omits Rev_dolh
      },
    });
    expect(mapped.model.mappingStatus).toBe("geographyNotRepresented");
    expect(mapped.model.geographyRepresentation).toBe("not_represented");
  });

  it("never invents country from phone / email / city_display text", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c2",
      data: {
        actev_user: true,
        phone_number: "+966501112233",
        email: "x@sa.example",
        city_display: "Riyadh",
        SuggestedPlaceCity: "Riyadh",
        mndob_vill_text: "Riyadh",
      },
    });
    expect(mapped.model.countryId.value).toBeNull();
    expect(mapped.model.cityId.value).toBeNull();
    expect(mapped.model.geographyRepresentation).toBe("not_represented");
    expect(
      mapped.mappingWarnings.some((w) => w.code === "city_text_not_canonical"),
    ).toBe(true);
  });

  it("tripLockHint from active_order_id without order N+1", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c3",
      data: {
        ...approvedCustomerSa.data,
        active_order_id: "order_abc",
      },
    });
    expect(mapped.model.tripLockHint).toBe("lockPresent");
  });
});

describe("Phase 4A-7 financial DOCUMENT_ONLY + duplicates + test markers", () => {
  it("Bookings_User is DOCUMENT_ONLY and non-authoritative", () => {
    expect(
      CUSTOMER_FINANCIAL_FIELD_NOTES.some(
        (n) =>
          n.legacyField === "Bookings_User" && n.exposure === "DOCUMENT_ONLY",
      ),
    ).toBe(true);
    const fin = summarizeCustomerFinancialPresence(approvedCustomerSa.data);
    expect(fin.bookingsCount).toBe(3);
    expect(fin.isAccountingApproved).toBe(false);
    expect(fin.isSettlementSafe).toBe(false);
    expect(fin.isAuthoritative).toBe(false);
  });

  it("duplicate audit uses hashes not raw contacts", () => {
    const phoneHash = hashCustomerPhoneForAudit("+966501112233");
    const emailHash = hashCustomerEmailForAudit("oscar@example.com");
    expect(phoneHash).toMatch(/^[a-f0-9]{64}$/);
    expect(emailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(phoneHash).not.toContain("5011");
    expect(emailHash).not.toContain("oscar");

    const a = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c1",
      data: approvedCustomerSa.data,
    });
    const b = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c2",
      data: { ...approvedCustomerSa.data, uid: "c2" },
    });
    const metrics = auditCustomerDuplicates([
      rowFromCanonicalCustomer(a.model, { phoneHash, emailHash }),
      rowFromCanonicalCustomer(b.model, { phoneHash, emailHash }),
    ]);
    expect(metrics.phoneHashCollisions).toBe(2);
    expect(metrics.emailHashCollisions).toBe(2);
    const part = reconcileCustomerAuditPartition(metrics);
    expect(part.ok).toBe(true);
  });

  it("testOrNoncanonical only with evidence", () => {
    expect(
      isTestOrNoncanonicalCustomer({
        documentId: "test_cust_1",
        data: { actev_user: true },
      }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalCustomer({
        documentId: "real_cust",
        data: { email: "x@touri-taxi-test.local", actev_user: true },
      }),
    ).toBe(true);
    expect(
      isTestOrNoncanonicalCustomer({
        documentId: "real_cust",
        data: { actev_user: true, display_name: "Normal" },
      }),
    ).toBe(false);
  });

  it("partition reconcile + closing gates", () => {
    const rows = [
      rowFromCanonicalCustomer(
        mapCanonicalCustomerFromLegacyDoc({
          documentId: "ok",
          data: approvedCustomerSa.data,
        }).model,
      ),
      rowFromCanonicalCustomer(
        mapCanonicalCustomerFromLegacyDoc({
          documentId: "drv",
          data: { ismndob: true },
        }).model,
      ),
      rowFromCanonicalCustomer(
        mapCanonicalCustomerFromLegacyDoc({
          documentId: "geo",
          data: { actev_user: true, display_name: "X" },
        }).model,
      ),
      rowFromCanonicalCustomer(
        mapCanonicalCustomerFromLegacyDoc({
          documentId: "unk",
          data: { uid: "unk" },
        }).model,
      ),
    ];
    const metrics = auditCustomerDuplicates(rows);
    expect(reconcileCustomerAuditPartition(metrics).ok).toBe(true);
    expect(metrics.excludedNonCustomer).toBe(1);
    expect(metrics.geographyNotRepresented).toBe(1);
    expect(metrics.validMapped).toBe(1);
    expect(metrics.excludedUnknownIdentity).toBe(1);
    expect(metrics.unknownDiscriminator).toBe(0);

    expect(
      customerLiveClosingGatesPass({
        unmappedCountry: 0,
        unknownDiscriminator: 0,
        malformed: 0,
        exactDocumentIdDuplicates: 0,
        unexpectedCollections: 0,
        productionWrites: 0,
        excludedNonCustomer: 1,
        excludedNonCustomerWithoutEvidence: 0,
        excludedUnknownIdentity: 1,
      }),
    ).toBe(true);

    expect(
      customerMappingReadyForLiveClose(metrics, {
        excludedNonCustomerWithoutEvidence: 0,
      }),
    ).toBe(true);
  });

  it("excludedNonCustomer diagnostics require authoritative evidence", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "admin1",
      data: { IsAdmin: true, actev_user: true },
    });
    const diag = selectCustomerDiagnosticsForLiveSummary([mapped.model])[0]!;
    expect(excludedNonCustomerHasAuthoritativeEvidence(diag)).toBe(true);
    expect(formatCustomerMappingNoGoMessage([])).toContain("NO-GO");
  });
});

describe("Phase 4A-7 query design + RBAC + writes", () => {
  it("orders by documentId (__name__), not created_time", () => {
    expect(PHASE_4A7_CUSTOMER_ORDER_FIELD).toBe("__name__");
    expect(isDocumentIdOrderField(PHASE_4A7_CUSTOMER_ORDER_FIELD)).toBe(true);
    expect(PHASE_4A7_CUSTOMER_TIMESTAMP_FIELD).toBe("created_time");
  });

  it("page limit ≤50; exceeds throws QuerySafetyError", async () => {
    expect(PHASE_4A7_CUSTOMERS_MAX_PAGE).toBe(50);
    const client = new FakeFirestoreReadClient();
    client.seed("user", [{ id: "c1", data: approvedCustomerSa.data }]);
    const repo = new FirebaseProductionCustomerReadRepository({
      client,
      productionReadEnabled: true,
    });
    await expect(
      repo.listSummary(ctx(), {}, { limit: 51, cursor: null }),
    ).rejects.toBeInstanceOf(QuerySafetyError);
  });

  it("list uses empty filters (no invented is_customer) + resource gate", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      { id: "c1", data: approvedCustomerSa.data },
      {
        id: "d1",
        data: { ismndob: true, actev_mndob: true },
      },
    ]);
    const repo = new FirebaseProductionCustomerReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["customers"]),
    });
    const page = await repo.listSummary(ctx(), {}, { limit: 50, cursor: null });
    expect(page.queryMeta.positiveEqualityFilterApplied).toBe(false);
    expect(page.queryMeta.discriminatorKind).toBe(
      "exclusionary_non_driver_non_agent",
    );
    expect(page.queryMeta.queryTimestampField).toBe("__name__");
    expect(page.items.length).toBe(2);
    expect(
      page.items.some((i) => i.data.mappingStatus === "excludedNonCustomer"),
    ).toBe(true);
    expect(page.auditMetrics.recordsRead).toBe(2);
    expect(reconcileCustomerAuditPartition(page.auditMetrics).ok).toBe(true);
  });

  it("live resource gate denies customers when allowlist is agents", async () => {
    const client = new FakeFirestoreReadClient();
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    await expect(
      repos.customers.listSummary(ctx(), {}, { limit: 10, cursor: null }),
    ).rejects.toBeInstanceOf(LiveResourceNotEnabledError);
  });

  it("kill switch denies when production read disabled", async () => {
    const client = new FakeFirestoreReadClient();
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: false,
    });
    await expect(
      repos.customers.getSummaryById(ctx(), "c1"),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
  });

  it("country scope filters post-map (optional policy like Trips)", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      { id: "c1", data: approvedCustomerSa.data },
      {
        id: "c2",
        data: {
          uid: "c2",
          actev_user: true,
          display_name: "Other",
          Rev_dolh: {
            path: "countries/cp5_country_unknown_zz",
            id: "cp5_country_unknown_zz",
          },
        },
      },
    ]);
    const repo = new FirebaseProductionCustomerReadRepository({
      client,
      productionReadEnabled: true,
    });
    const resolvedSa = resolveCanonicalCountryId("saudi_arabia");
    expect(resolvedSa.status).toBe("mapped");
    const sa =
      resolvedSa.status === "mapped"
        ? resolvedSa.canonicalCountryId
        : "saudi_arabia";
    const page = await repo.listSummary(
      ctx({
        scope: { type: "country", countryIds: [sa] },
        serverScopeFilter: { countryIds: [sa] },
      }),
      { countryIds: [sa] },
      { limit: 50, cursor: null },
    );
    expect(page.items.every((i) => i.data.countryId.value === sa)).toBe(true);
  });

  it("CUSTOMER_WRITE_ENABLED=false blocks writes", () => {
    expect(() => assertProductionWriteAllowed("customer")).toThrow(
      /CUSTOMER_WRITE|PRODUCTION_WRITE/,
    );
  });

  it("shadow trap denies customer mutation routes", () => {
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/customers/activate",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
  });

  it("index failure classifier recognizes composite index errors", () => {
    const c = classifyCustomerLiveQueryFailure(
      new Error("FAILED_PRECONDITION: The query requires an index"),
    );
    expect(c.kind).toBe("index_dependency");
    expect(c.blocker).toBe(CUSTOMER_QUERY_INDEX_DEPENDENCY_BLOCKER);
  });

  it("live-safe summary leak detector catches raw phone / fcm / password", () => {
    expect(
      customerLiveReportHasSensitiveLeak(
        JSON.stringify({ phone_number: "+966501112233" }),
      ),
    ).toBe(true);
    expect(
      customerLiveReportHasSensitiveLeak(
        JSON.stringify({ sourceDocumentId: "c1", mappingStatus: "validMapped" }),
      ),
    ).toBe(false);
  });
});
