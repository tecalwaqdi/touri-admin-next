/**
 * Presentation-only QA / demo / synthetic fixture detection for catalog lists.
 * Never auto-deletes or merges Production records.
 */

import { looksLikePilotOrTestDocumentId } from "@/domain/production-read/SourceLabel";

const FUNCTIONAL_TEST_RE = /FUNCTIONAL\s+TEST/i;
const DEMO_LIC_RE = /^DEMO[-_]/i;
const DEMO_NAME_RE = /تجريبي|demo\b|experimental/i;
const CP5_ID_RE = /^cp5_/i;
const SA_SYNTHETIC_PARTY_RE = /^(AGT|DRV|TRIP)-SA-\d+$/i;

export function isQaOrTestDisplayName(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  return FUNCTIONAL_TEST_RE.test(name.trim());
}

export function isDemoFleetRecord(input: {
  id?: string | null;
  displayName?: string | null;
  licenseNumber?: string | null;
}): boolean {
  if (looksLikePilotOrTestDocumentId(input.id)) return true;
  if (input.licenseNumber && DEMO_LIC_RE.test(input.licenseNumber.trim())) {
    return true;
  }
  if (input.displayName && DEMO_NAME_RE.test(input.displayName.trim())) {
    return true;
  }
  return false;
}

export function isQaOrTestCatalogRecord(input: {
  id?: string | null;
  displayName?: string | null;
  displayNameAr?: string | null;
  displayNameEn?: string | null;
  codeCar?: string | null;
  licenseNumber?: string | null;
}): boolean {
  if (looksLikePilotOrTestDocumentId(input.id)) return true;
  if (input.id && CP5_ID_RE.test(input.id)) return true;
  if (isQaOrTestDisplayName(input.displayName)) return true;
  if (isQaOrTestDisplayName(input.displayNameAr)) return true;
  if (isQaOrTestDisplayName(input.displayNameEn)) return true;
  if (isDemoFleetRecord(input)) return true;
  return false;
}

/** Offline / seed settlement party & trip ids — never Production defaults. */
export function isSyntheticSettlementFixtureId(
  id: string | null | undefined,
): boolean {
  if (!id) return false;
  return (
    looksLikePilotOrTestDocumentId(id) ||
    SA_SYNTHETIC_PARTY_RE.test(id.trim()) ||
    CP5_ID_RE.test(id.trim())
  );
}

/**
 * Finance SoT QA exclusion — explicit synthetic fixtures only.
 * Keeps real Production ids (e.g. `fin_set_*`, `drv_line_<realOrderId>`) visible.
 * Still catches `test_adminnext_*`, prefix `test_`/`pilot_`/`frN_`/`cp5_`,
 * SA seed parties, demo fixture tokens, and `drv_line_test_*` claim wrappers.
 */
/**
 * Explicit Finance/Admin Next control / runtime fixture order ids.
 * Do NOT match commercial ids like `fin_set_*`.
 */
const FINANCE_CONTROL_FIXTURE_ID_RE =
  /^(?:demo_fin_|fin_rt_|fin\d+_ctrl_)/i;

export function isFinanceQaOrPilotRecordId(
  id: string | null | undefined,
): boolean {
  if (!id) return false;
  const t = id.trim();
  if (!t) return false;
  if (looksLikePilotOrTestDocumentId(t)) return true;
  if (SA_SYNTHETIC_PARTY_RE.test(t)) return true;
  if (CP5_ID_RE.test(t)) return true;
  if (/^(?:demo_|demo-)/i.test(t) || /^demo$/i.test(t)) return true;
  if (FINANCE_CONTROL_FIXTURE_ID_RE.test(t)) return true;
  // Claim wrappers around fixture order ids: drv_line_test_adminnext_… / drv_line_test_*
  if (/^drv_line_test_/i.test(t)) return true;
  return false;
}
