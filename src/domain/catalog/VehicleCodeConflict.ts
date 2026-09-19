/**
 * Detect duplicate vehicle codes and conflicting hourly rates.
 * Flag-only — never auto-merge historical records.
 */

export type VehicleConflictKind = "DUPLICATE" | "CONFLICT" | "QA";

export type VehicleCatalogConflict = {
  kind: VehicleConflictKind;
  code: string;
  messageEn: string;
  messageAr: string;
  vehicleIds: string[];
  rates: Array<number | null>;
};

export type VehicleConflictInput = {
  id: string;
  codeCar: string | null;
  hourlyRateSr: number | null;
  displayName?: string | null;
};

export function detectVehicleCodeConflicts(
  rows: readonly VehicleConflictInput[],
): VehicleCatalogConflict[] {
  const byCode = new Map<string, VehicleConflictInput[]>();
  for (const row of rows) {
    const code = row.codeCar?.trim().toLowerCase();
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    list.push(row);
    byCode.set(code, list);
  }

  const out: VehicleCatalogConflict[] = [];
  for (const [code, members] of byCode) {
    if (members.length < 2) continue;
    const rates = members.map((m) => m.hourlyRateSr);
    const distinctRates = new Set(
      rates.filter((r): r is number => r != null && Number.isFinite(r)),
    );
    const ids = members.map((m) => m.id);
    if (distinctRates.size > 1) {
      out.push({
        kind: "CONFLICT",
        code,
        messageEn: `Conflicting hourly rates for code ${code}`,
        messageAr: `أسعار ساعة متعارضة للرمز ${code}`,
        vehicleIds: ids,
        rates,
      });
    } else {
      out.push({
        kind: "DUPLICATE",
        code,
        messageEn: `Duplicate vehicle type code ${code}`,
        messageAr: `رمز نوع مركبة مكرر ${code}`,
        vehicleIds: ids,
        rates,
      });
    }
  }
  return out;
}

export function vehicleIdsInConflict(
  conflicts: readonly VehicleCatalogConflict[],
): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    for (const id of c.vehicleIds) ids.add(id);
  }
  return ids;
}
