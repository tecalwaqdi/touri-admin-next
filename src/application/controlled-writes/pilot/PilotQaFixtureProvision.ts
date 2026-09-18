/**
 * QA-only synthetic fixtures for Admin Next domain write pilots (ops_writer).
 * Explicit test_/qa_ ids and qaFirestoreMarkers only — never commercial records.
 */

import {
  isExplicitQaId,
  qaFirestoreMarkers,
  type AdminNextQaDomain,
} from "@/application/controlled-writes/pilot/SyntheticFixtureFactory";
import type { GeographyWriteFlagGate } from "@/application/controlled-writes/geography/GeographyControlledWriteService";
import { assertGeographyProductionWriteEnabled } from "@/application/controlled-writes/geography/GeographyControlledWriteService";
import type { P0WriteDomain, P0WriteFlagGate } from "@/application/controlled-writes/P0WriteGates";
import { assertP0ProductionWriteEnabled } from "@/application/controlled-writes/P0WriteGates";
import type { SupportWriteFlagGate } from "@/application/controlled-writes/support/SupportWriteTypes";
import { assertSupportProductionWriteEnabled } from "@/application/controlled-writes/support/SupportWriteFlags";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

export type GeographyQaResource = "region" | "city" | "landmark";

const GEO_COLLECTION: Record<GeographyQaResource, string> = {
  region: "cities",
  city: "villages",
  landmark: "mkan",
};

const P0_COLLECTION: Record<P0WriteDomain, string> = {
  region: "cities",
  vehicle_catalog: "type_car",
  partner: "mkan",
  fleet: "transport_company",
  guide: "user",
};

function requireQaId(id: string, label: string): string {
  const trimmed = String(id || "").trim();
  if (!trimmed || !isExplicitQaId(trimmed)) {
    throw Object.assign(
      new Error(`${label} id must use test_/qa_/demo_/golden_/cp5_ prefix`),
      { code: "VALIDATION_FAILED" },
    );
  }
  return trimmed;
}

function tokenFromSnap(updateTime: string | null, id: string): string {
  return updateTime ? `fs_ut_${updateTime}` : `fs_new_${id.slice(0, 8)}`;
}

export async function ensureGeographyQaFixture(input: {
  resource: GeographyQaResource;
  resourceId: string;
  flags: GeographyWriteFlagGate;
  port?: ProductionFirestoreWritePort;
  countryId?: string;
  regionId?: string;
  cityId?: string;
  displayNameEn?: string;
}): Promise<{
  resource: GeographyQaResource;
  resourceId: string;
  created: boolean;
  preconditionToken: string;
}> {
  assertGeographyProductionWriteEnabled(input.flags, input.resource);
  const resourceId = requireQaId(input.resourceId, "Geography QA");
  const port = input.port ?? createWifWritePortOrThrow("ops_writer");
  const collection = GEO_COLLECTION[input.resource];
  const existing = await port.getDocument(collection, resourceId);
  if (existing.exists) {
    return {
      resource: input.resource,
      resourceId,
      created: false,
      preconditionToken: tokenFromSnap(existing.updateTime, resourceId),
    };
  }

  const markers = qaFirestoreMarkers();
  const fields: Record<string, unknown> = {
    ...markers,
    active: true,
    archived: false,
    name_en:
      input.displayNameEn?.trim() ||
      `Admin Next QA ${input.resource} ${resourceId.slice(-8)}`,
    name_ar: `اختبار ${resourceId.slice(-6)}`,
  };
  if (input.countryId) {
    fields.Rev_dolh = { path: `countries/${input.countryId}` };
    fields.countryId = input.countryId;
  }
  if (input.regionId) fields.regionId = input.regionId;
  if (input.cityId) fields.cityId = input.cityId;

  const created = await port.createDocument(collection, resourceId, fields);
  return {
    resource: input.resource,
    resourceId,
    created: true,
    preconditionToken: tokenFromSnap(created.updateTime, resourceId),
  };
}

export async function ensureP0QaFixture(input: {
  domain: P0WriteDomain;
  resourceId: string;
  flags: P0WriteFlagGate;
  port?: ProductionFirestoreWritePort;
  metadata?: Record<string, unknown>;
}): Promise<{
  domain: P0WriteDomain;
  resourceId: string;
  created: boolean;
  preconditionToken: string;
}> {
  assertP0ProductionWriteEnabled(input.domain, input.flags);
  const resourceId = requireQaId(input.resourceId, "P0 QA");
  const port = input.port ?? createWifWritePortOrThrow("ops_writer");
  const collection = P0_COLLECTION[input.domain];
  const existing = await port.getDocument(collection, resourceId);
  if (existing.exists) {
    return {
      domain: input.domain,
      resourceId,
      created: false,
      preconditionToken: tokenFromSnap(existing.updateTime, resourceId),
    };
  }

  const fields: Record<string, unknown> = {
    ...qaFirestoreMarkers(),
    active: true,
    archived: false,
    name_en: `Admin Next QA ${input.domain} ${resourceId.slice(-8)}`,
    ...(input.metadata ?? {}),
  };
  if (input.domain === "partner") fields.isShrek = true;
  if (input.domain === "guide") {
    fields.is_tour_guide = true;
    fields.actev_user = true;
    fields.email = `${resourceId}@touri-taxi-test.invalid`;
  }

  const created = await port.createDocument(collection, resourceId, fields);
  return {
    domain: input.domain,
    resourceId,
    created: true,
    preconditionToken: tokenFromSnap(created.updateTime, resourceId),
  };
}

export async function ensureSupportQaFixture(input: {
  ticketId: string;
  flags: SupportWriteFlagGate;
  port?: ProductionFirestoreWritePort;
}): Promise<{
  ticketId: string;
  created: boolean;
  preconditionToken: string;
}> {
  assertSupportProductionWriteEnabled(input.flags);
  const ticketId = requireQaId(input.ticketId, "Support QA");
  const port = input.port ?? createWifWritePortOrThrow("ops_writer");
  const existing = await port.getDocument("support", ticketId);
  if (existing.exists) {
    return {
      ticketId,
      created: false,
      preconditionToken: tokenFromSnap(existing.updateTime, ticketId),
    };
  }

  const created = await port.createDocument("support", ticketId, {
    ...qaFirestoreMarkers(),
    naim: `Admin Next QA Support ${ticketId.slice(-8)}`,
    osf: "Synthetic pilot fixture — safe to mutate in Admin Next write pilot.",
    halh: "open",
    status: "open",
    tsnef: "pilot_qa",
    priority: "low",
    data: new Date().toISOString(),
  });
  return {
    ticketId,
    created: true,
    preconditionToken: tokenFromSnap(created.updateTime, ticketId),
  };
}

export function defaultQaId(domain: AdminNextQaDomain, suffix: string): string {
  const clean = String(suffix || "a")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 20);
  return `test_adminnext_${domain}_${clean}`;
}
