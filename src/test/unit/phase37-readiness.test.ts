import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, resetEnvCache, getEnv } from "@/config/env";
import {
  assertAuthModeAllowed,
  AuthModeGuardError,
  isMockAuthAllowed,
} from "@/config/authModeGuard";
import {
  FakeProductionIdentityVerifier,
  buildVerifiedIdentity,
  FakeAgentCountryMembershipChecker,
  mapClaimsToIdentity,
  resolveActorFromVerifiedToken,
  AUTH_CLAIM_MAPPING_TABLE,
} from "@/domain/auth/ProductionAuthDesign";
import { maskEmail, maskPhone } from "@/domain/pii/maskIdentity";
import { projectCustomerPii } from "@/domain/customer/CanonicalCustomerRead";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import {
  resolveCityId,
  isCityScopeOperationAllowed,
  resetCityAliasCache,
  type CityAliasEntry,
} from "@/domain/geography/CityAliasResolver";
import { evaluateCrossCityScope } from "@/domain/geography/CrossCityScope";
import { mapLegacyTripStatusContract } from "@/domain/canonical/legacyStatusContract";
import {
  selectTripStatusSource,
  TRIP_STATUS_SOURCE_PRIORITY,
} from "@/domain/trip/TripStatusSourcePriority";
import { mapDriverCanonicalStatuses } from "@/domain/driver/DriverCanonicalStatuses";
import { mapCanonicalTimestamp } from "@/domain/canonical/TimestampMapper";
import { mapCurrency } from "@/domain/canonical/CurrencyMapper";
import {
  applyServerSideScopeFilter,
  assertReadAuthorized,
  buildServerSideScopeFilter,
  isGenericCollectionReadPath,
  redactFinancialFields,
  READ_AUTHORIZATION_PIPELINE,
} from "@/domain/read/ReadAuthorization";
import {
  normalizePageRequest,
  PaginationPolicyError,
} from "@/domain/read/ReadQuery";
import {
  assertNoSensitiveLeak,
  toPublicApiError,
} from "@/domain/read/ApiErrorContract";
import { SENSITIVE_FIELD_REGISTRY } from "@/domain/read/SensitiveFieldRegistry";
import { classificationFor } from "@/domain/canonical/FinancialFieldClassification";
import { permissionsForRole } from "@/permissions/rbac";
import {
  isHeaderUserIdAuthAllowed,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";

describe("Phase 3.7 AUTH_MODE startup guard", () => {
  beforeEach(() => {
    resetEnvCache();
  });

  it("forbids mock auth in staging", () => {
    expect(() =>
      assertAuthModeAllowed({
        APP_ENV: "staging",
        AUTH_MODE: "mock",
      }),
    ).toThrow(AuthModeGuardError);

    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_ENV: "staging",
        AUTH_MODE: "mock",
      }),
    ).toThrow(/AUTH_MODE=mock is FORBIDDEN/);
  });

  it("forbids mock auth in production", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        NEXT_PUBLIC_APP_ENV: "production",
        AUTH_MODE: "mock",
      }),
    ).toThrow(/AUTH_MODE=mock is FORBIDDEN/);
  });

  it("allows mock only in development", () => {
    expect(isMockAuthAllowed("development")).toBe(true);
    expect(isMockAuthAllowed("staging")).toBe(false);
    expect(isMockAuthAllowed("production")).toBe(false);
    const env = loadEnv({
      NODE_ENV: "development",
      APP_ENV: "development",
      NEXT_PUBLIC_APP_ENV: "development",
      AUTH_MODE: "mock",
    });
    expect(env.AUTH_MODE).toBe("mock");
  });

  it("allows verified_token in staging/production", () => {
    const staging = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_ENV: "staging",
      AUTH_MODE: "verified_token",
    });
    expect(staging.AUTH_MODE).toBe("verified_token");
    const prod = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      AUTH_MODE: "verified_token",
    });
    expect(prod.AUTH_MODE).toBe("verified_token");
  });
});

describe("Phase 3.7 ProductionIdentityVerifier fail-closed", () => {
  const issuer = "https://securetoken.google.com/fake-project";
  const audience = "fake-project";

  it("denies missing/invalid/expired/wrong audience/issuer/disabled/malformed", async () => {
    const now = Date.now();
    const verifier = new FakeProductionIdentityVerifier(
      {
        expired: buildVerifiedIdentity({
          uid: "u1",
          claims: { super_admin: true },
          expiresAt: new Date(now - 120_000),
          issuer,
          audience,
        }),
        wrongAud: buildVerifiedIdentity({
          uid: "u2",
          claims: { super_admin: true },
          issuer,
          audience: "other-project",
        }),
        wrongIss: buildVerifiedIdentity({
          uid: "u3",
          claims: { super_admin: true },
          issuer: "https://evil.example",
          audience,
        }),
        disabled: buildVerifiedIdentity({
          uid: "u4",
          disabled: true,
          claims: { super_admin: true },
          issuer,
          audience,
        }),
        ok: buildVerifiedIdentity({
          uid: "u5",
          email: "sa@x.com",
          claims: { super_admin: true },
          issuer,
          audience,
        }),
      },
      { expectedIssuer: issuer, expectedAudience: audience },
    );

    expect((await verifier.verify("")).ok).toBe(false);
    expect((await verifier.verify("nope")).ok).toBe(false);
    const expired = await verifier.verify("expired");
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("expired_token");
    expect((await verifier.verify("wrongAud")).ok).toBe(false);
    expect((await verifier.verify("wrongIss")).ok).toBe(false);
    expect((await verifier.verify("disabled")).ok).toBe(false);

    const ok = await resolveActorFromVerifiedToken(verifier, "ok");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.identity.role).toBe("super_admin");
  });

  it("denies unknown role and does not downgrade to viewer", () => {
    const mapped = mapClaimsToIdentity({ uid: "x", email: "x@y.com" });
    expect("deny" in mapped).toBe(true);
    if ("deny" in mapped) {
      expect(mapped.reason).toMatch(/unknown_claim_role/);
      expect(mapped).not.toHaveProperty("role", "reporting_viewer");
      expect(mapped).not.toHaveProperty("role", "viewer");
    }
  });

  it("denies missing country scope for country_admin", () => {
    const mapped = mapClaimsToIdentity({ uid: "c1", country_admin: true });
    expect("deny" in mapped).toBe(true);
    if ("deny" in mapped) expect(mapped.reason).toMatch(/missing_scope/);
  });

  it("requires agent + agentId + countryId + membership domain check", async () => {
    const membership = new FakeAgentCountryMembershipChecker([
      { agentId: "agent-1", countryId: "saudi_arabia" },
    ]);
    const denyMissing = mapClaimsToIdentity({ uid: "agent-1", agent: true });
    expect("deny" in denyMissing).toBe(true);

    const denyMembership = await resolveActorFromVerifiedToken(
      new FakeProductionIdentityVerifier({
        a: buildVerifiedIdentity({
          uid: "agent-1",
          claims: {
            agent: true,
            country_id: "countries/saudi_arabia",
            agent_id: "agent-1",
          },
        }),
      }),
      "a",
      {
        agentMembership: new FakeAgentCountryMembershipChecker([]),
      },
    );
    expect(denyMembership.ok).toBe(false);

    const ok = await resolveActorFromVerifiedToken(
      new FakeProductionIdentityVerifier({
        a: buildVerifiedIdentity({
          uid: "agent-1",
          claims: {
            agent: true,
            country_id: "countries/saudi_arabia",
            agent_id: "agent-1",
          },
        }),
      }),
      "a",
      { agentMembership: membership },
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.identity.role).toBe("agent_user");
      expect(ok.identity.scope.type).toBe("agent");
      expect(ok.identity.scope.countryIds).toContain("saudi_arabia");
    }
  });

  it("maps partner/transport as unsupported_legacy_role → DENY", () => {
    const p = mapClaimsToIdentity({ uid: "p1", partner: true });
    expect("deny" in p).toBe(true);
    if ("deny" in p) expect(p.reason).toMatch(/unsupported_legacy_role/);
    const t = mapClaimsToIdentity({ uid: "t1", transport_manager: true });
    expect("deny" in t).toBe(true);
  });

  it("documents claims mapping table", () => {
    expect(AUTH_CLAIM_MAPPING_TABLE.length).toBeGreaterThanOrEqual(7);
  });

  it("never trusts spoof headers outside development", async () => {
    expect(isHeaderUserIdAuthAllowed("staging")).toBe(false);
    process.env.APP_ENV = "staging";
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    process.env.AUTH_MODE = "verified_token";
    resetEnvCache();
    await expect(
      resolveApiActor(
        new Request("http://localhost/api/trips", {
          headers: { "x-role": "super_admin", "x-country": "SA" },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    process.env.APP_ENV = "development";
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    process.env.AUTH_MODE = "mock";
    resetEnvCache();
  });
});

describe("Phase 3.7 Geography", () => {
  beforeEach(() => resetCityAliasCache());

  it("canonicalizes country from Legacy aliases", () => {
    const r = resolveCanonicalCountryId("country_sa");
    expect(r.status).toBe("mapped");
    if (r.status === "mapped") {
      expect(r.canonicalCountryId).toBe("saudi_arabia");
      expect(r.iso2).toBe("SA");
    }
  });

  it("resolves city aliases and blocks unmapped city-scope ops", () => {
    const mapped = resolveCityId("city_makkah");
    expect(mapped.status).toBe("mapped");
    if (mapped.status === "mapped") {
      expect(mapped.cityId).toBe("city_sa_makkah");
    }
    expect(isCityScopeOperationAllowed(mapped)).toBe(true);

    const unmapped = resolveCityId("city_unknown_xyz");
    expect(unmapped.status).toBe("unmapped");
    expect(unmapped.cityId).toBeNull();
    expect(isCityScopeOperationAllowed(unmapped)).toBe(false);
  });

  it("returns AMBIGUOUS_CITY when multiple targets match", () => {
    const aliases: CityAliasEntry[] = [
      {
        aliasId: "city_dup",
        canonicalCityId: "city_a",
        countryId: "saudi_arabia",
        confidence: "low",
        evidence: "fixture",
      },
      {
        aliasId: "city_dup",
        canonicalCityId: "city_b",
        countryId: "saudi_arabia",
        confidence: "low",
        evidence: "fixture",
      },
    ];
    const r = resolveCityId("city_dup", aliases);
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") {
      expect(r.code).toBe("AMBIGUOUS_CITY");
      expect(r.cityId).toBeNull();
      expect(r.candidates).toEqual(["city_a", "city_b"]);
    }
  });

  it("detects cross-city mismatch without relocating", () => {
    const r = evaluateCrossCityScope({
      tripCityId: "city_sa_jeddah",
      driverCityId: "city_sa_riyadh",
    });
    expect(r.scopeConsistencyStatus).toBe("cross_city");
    expect(r.displayMismatch).toBe(true);
    expect(r.tripCityId).toBe("city_sa_jeddah");
    expect(r.driverCityId).toBe("city_sa_riyadh");
  });
});

describe("Phase 3.7 Customer PII", () => {
  it("masks phone and email without corrupting null/unknown", () => {
    expect(maskPhone("0512345612")).toMatch(/^05\*+12$/);
    expect(maskEmail("user@example.com")).toBe("u***@example.com");
    expect(maskPhone(null)).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
    expect(maskPhone("unknown")).toBe("unknown");
  });

  it("customers:read does not imply full PII", () => {
    const masked = projectCustomerPii(
      { phone: "0512345612", email: "user@example.com" },
      ["customers:read"],
    );
    expect(masked.mode).toBe("masked");
    expect(masked.phone).not.toBe("0512345612");
    expect(masked.email).toBe("u***@example.com");

    const full = projectCustomerPii(
      { phone: "0512345612", email: "user@example.com" },
      ["customers:read", "customers:read_pii"],
    );
    expect(full.mode).toBe("full");
    expect(full.phone).toBe("0512345612");
  });
});

describe("Phase 3.7 Trip / Driver statuses", () => {
  it("unknown trip status → unmapped + ops unsafe + displayable", () => {
    const r = mapLegacyTripStatusContract("weird_xyz");
    expect(r.canonical).toBe("unmapped");
    expect(r.isSafeForOperationalAction).toBe(false);
    expect(r.isDisplayable).toBe(true);
  });

  it("documents status_code as priority #1", () => {
    expect(TRIP_STATUS_SOURCE_PRIORITY[0].source).toBe("status_code");
    const sel = selectTripStatusSource({
      status_code: null,
      halh_text: "مكتمل",
    });
    expect(sel.isSafeForOperationalAction).toBe(false);
    expect(sel.selected).toBe("halh_text");
  });

  it("keeps driver axes orthogonal", () => {
    const s = mapDriverCanonicalStatuses({
      registration_status: "pending_review",
      actev_mndob: true,
      is_online: false,
      on_trip: false,
      mndon_newacc: false,
    });
    expect(s.registration.value).toBe("pending_review");
    expect(s.approval.value).toBe("pending_review");
    expect(s.account.value).toBe("enabled");
    expect(s.accountBool).toBe(true);
    expect(s.warnings.some((w) => /≠ approved/.test(w))).toBe(true);
    expect(s.presence.value).toBe(false);
    expect(s.online.value).toBe("offline");
    expect(s.tripState.value).toBe("idle");
  });
});

describe("Phase 3.7 Timestamp + Currency", () => {
  it("maps firestore-like and ms/seconds timestamps", () => {
    const ms = mapCanonicalTimestamp(1_700_000_000_000);
    expect(ms.utcIso).toBeTruthy();
    expect(ms.sourceKind).toBe("epoch_ms");
    const sec = mapCanonicalTimestamp(1_700_000_000);
    expect(sec.sourceKind).toBe("epoch_seconds");
    const ts = mapCanonicalTimestamp({ seconds: 1700000000, nanoseconds: 0 });
    expect(ts.sourceKind).toBe("firestore_timestamp");
    expect(ts.utcIso).toBeTruthy();
  });

  it("refuses unprovable local unlabeled when assumeLocalUnlabeled", () => {
    const r = mapCanonicalTimestamp("2024-01-01T12:00:00", {
      assumeLocalUnlabeled: true,
    });
    expect(r.utcIso).toBeNull();
  });

  it("flags currency conflicts and derives from country when reliable", () => {
    const derived = mapCurrency({ countryIso2: "SA" });
    expect(derived.currencyCode).toBe("SAR");
    expect(derived.confidence).toBe("derived");

    const conflict = mapCurrency({
      orderCurrency: "SAR",
      countryCurrency: "AED",
    });
    expect(conflict.currencyConflict).toBe(true);
    expect(conflict.currencyCode).toBe("SAR");
  });
});

describe("Phase 3.7 Read authorization + pagination + financial block", () => {
  it("documents pipeline order and forbids generic collection read", () => {
    expect(READ_AUTHORIZATION_PIPELINE[0]).toBe("verify_identity");
    expect(READ_AUTHORIZATION_PIPELINE).toContain("server_scope_filter");
    expect(isGenericCollectionReadPath("/api/read?collection=order")).toBe(
      true,
    );
    expect(isGenericCollectionReadPath("/api/trips")).toBe(false);
  });

  it("applies server-side scope filter (never query-all client filter)", () => {
    const scope = { type: "country" as const, countryIds: ["saudi_arabia"] };
    expect(buildServerSideScopeFilter(scope)).toEqual({
      countryIds: ["saudi_arabia"],
    });
    const filtered = applyServerSideScopeFilter(
      [
        { countryId: "saudi_arabia", id: "1" },
        { countryId: "spain", id: "2" },
      ],
      scope,
    );
    expect(filtered.map((r) => r.id)).toEqual(["1"]);
  });

  it("enforces MAX_PAGE_SIZE / forbids unbounded reads", () => {
    const max = getEnv().MAX_PAGE_SIZE || 100;
    expect(() => normalizePageRequest({}, max)).toThrow(PaginationPolicyError);
    expect(() => normalizePageRequest({ limit: max + 1 }, max)).toThrow(
      /MAX_PAGE_SIZE/,
    );
    expect(normalizePageRequest({ limit: 50 }, max).limit).toBe(50);
  });

  it("blocks DO_NOT_EXPOSE_YET financial fields", () => {
    const { blockedFields, data } = redactFinancialFields({
      grossFare: 50,
      refundAmount: 5,
      chargebackAmount: 0,
      gatewayFee: 1,
    });
    expect(blockedFields).toEqual(
      expect.arrayContaining([
        "refundAmount",
        "chargebackAmount",
        "gatewayFee",
      ]),
    );
    expect(data.refundAmount).toBeUndefined();
    expect(data.grossFare).toBe(50);
    expect(classificationFor("refundAmount")?.exposure).toBe(
      "DO_NOT_EXPOSE_YET",
    );
  });

  it("denies missing required scope permission", () => {
    const perms = permissionsForRole("agent_user");
    const r = assertReadAuthorized({
      permissions: perms,
      scope: { type: "agent", agentIds: ["a1"], countryIds: ["saudi_arabia"] },
      required: "trips:read",
      resource: { agentId: "other" },
    });
    expect(r.ok).toBe(false);
  });

  it("keeps API errors free of stacks/paths/claims", () => {
    const body = toPublicApiError({
      code: "UNAUTHORIZED",
      message: "Error at Object.verify (/Users/ventura/secret/firebase-admin.js)",
      requestId: "r1",
      correlationId: "c1",
      internalDetail: { claims: { super_admin: true } },
    });
    expect(body.message).toBe("Request failed");
    expect(assertNoSensitiveLeak(body)).toBe(true);
    expect(SENSITIVE_FIELD_REGISTRY.length).toBeGreaterThan(0);
  });

  it("keeps production flags disabled", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      APP_ENV: "development",
      NEXT_PUBLIC_APP_ENV: "development",
      AUTH_MODE: "mock",
    });
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
  });
});
