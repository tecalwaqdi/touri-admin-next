/**
 * Settlement party / country cell presentation — names primary, IDs secondary.
 */

import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { presentCountryLabel } from "@/domain/presentation/geoReferencePresentation";
import { shortenId } from "@/domain/presentation/operationalDisplayName";

export function presentSettlementPartyType(
  partyType: string | null | undefined,
  locale: FinanceLocale,
): string {
  if (partyType === "driver") return presentFinanceTerm("driver", locale);
  if (partyType === "agent") return presentFinanceTerm("agent", locale);
  return partyType?.trim() || presentFinanceTerm("party", locale);
}

export function presentSettlementPartyPrimary(input: {
  partyType: string;
  partyLabel?: string | null;
  partyIdToken: string;
  locale: FinanceLocale;
}): string {
  const typeLabel = presentSettlementPartyType(input.partyType, input.locale);
  const name = input.partyLabel?.trim();
  if (name) return `${typeLabel}: ${name}`;
  return `${typeLabel} (${shortenId(input.partyIdToken, 12) ?? input.partyIdToken})`;
}

export function presentSettlementPartyTitle(input: {
  partyType: string;
  partyLabel?: string | null;
  partyIdToken: string;
}): string {
  return `${input.partyType}:${input.partyIdToken}`;
}

export function presentSettlementCountryPrimary(input: {
  countryId: string;
  countryLabel?: string | null;
  locale: FinanceLocale;
}): string {
  const fromApi = input.countryLabel?.trim();
  if (fromApi) return fromApi;
  return (
    presentCountryLabel(input.countryId, input.locale) ?? input.countryId
  );
}
