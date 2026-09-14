/**
 * Finance read service — UI DTOs from snapshots (non-authoritative UI).
 * Never recomputes rates for Production display.
 */

import type { TripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";
import type { AccountingLine } from "@/domain/finance/v2/AccountingLine";
import type { SettlementV2 } from "@/domain/settlement/v2/SettlementV2";
import { settlementOpsLabel } from "@/domain/settlement/v2/SettlementV2";
import { runHistoricalCalculationPipeline } from "@/domain/finance/v2/CalculationPipeline";
import { chargebackNotRepresented } from "@/domain/finance/v2/FinanceImplementationContracts";

export type TripFinanceReadDto = {
  orderId: string;
  currency: string;
  paymentChannel: string;
  grossFareMinor: string | null;
  platformCommissionMinor: string | null;
  vatAmountMinor: string | null;
  driverNetMinor: string | null;
  driverNetProvenance: "persisted" | "missing" | "derived_diagnostic";
  agentAttributionStatus: string;
  agentAmountMinor: string | null;
  companyPlatformNetMinor: string | null;
  chargebackAmountMinor: null;
  chargebackAvailability: "not_represented";
  incompleteReasons: string[];
  policyBlockers: string[];
  productionApproved: false;
};

export type SettlementReadDto = {
  id: string;
  partyType: string;
  partyId: string;
  status: string;
  opsLabel: string;
  currency: string;
  amountMinor: string;
  paidConfirmedMinor: string;
  outstandingMinor: string;
  productionApproved: false;
  synthetic: false;
};

function minorStr(v: bigint | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v.toString();
}

export class FinanceReadService {
  toTripDto(snapshot: TripFinancialSnapshot): TripFinanceReadDto {
    const pipeline = runHistoricalCalculationPipeline(snapshot);
    const incompleteReasons = snapshot.warnings.slice();
    let driverNetProvenance: TripFinanceReadDto["driverNetProvenance"] =
      "missing";
    let driverNetMinor: string | null = null;
    if (snapshot.majors.driverNet.availability === "available") {
      driverNetProvenance = "persisted";
      driverNetMinor = minorStr(snapshot.majors.driverNet.amountMinor);
    } else if (snapshot.derivedDriverNet.amountMinor != null) {
      driverNetProvenance = "derived_diagnostic";
      driverNetMinor = minorStr(snapshot.derivedDriverNet.amountMinor);
      incompleteReasons.push("driver_net_derived_not_settlement_eligible");
    }
    const cb = chargebackNotRepresented();
    return {
      orderId: snapshot.majors.orderId,
      currency: snapshot.majors.currency,
      paymentChannel: snapshot.majors.paymentChannel,
      grossFareMinor: minorStr(snapshot.majors.grossFare.amountMinor),
      platformCommissionMinor: minorStr(
        snapshot.majors.platformCommission.amountMinor,
      ),
      vatAmountMinor: minorStr(snapshot.majors.vatAmount.amountMinor),
      driverNetMinor,
      driverNetProvenance,
      agentAttributionStatus: snapshot.agent.status,
      agentAmountMinor: minorStr(snapshot.agent.amountMinor),
      companyPlatformNetMinor: minorStr(snapshot.companyPlatformNet.amountMinor),
      chargebackAmountMinor: cb.amountMinor,
      chargebackAvailability: cb.availability,
      incompleteReasons,
      policyBlockers: pipeline.policyBlockers,
      productionApproved: false,
    };
  }

  toSettlementDto(settlement: SettlementV2): SettlementReadDto {
    return {
      id: settlement.id,
      partyType: settlement.partyType,
      partyId: settlement.partyId,
      status: settlement.status,
      opsLabel: settlementOpsLabel(settlement),
      currency: settlement.currency,
      amountMinor: settlement.amountMinor.toString(),
      paidConfirmedMinor: settlement.paidConfirmedMinor.toString(),
      outstandingMinor: (
        settlement.amountMinor - settlement.paidConfirmedMinor
      ).toString(),
      productionApproved: false,
      synthetic: false,
    };
  }

  toLineDto(line: AccountingLine): {
    lineId: string;
    eligible: boolean;
    exclusionReason?: string;
    amountMinor: string | null;
    direction: string;
    partyType: string;
  } {
    return {
      lineId: line.lineId,
      eligible: line.eligibility.eligible,
      exclusionReason: line.eligibility.exclusionReason,
      amountMinor: minorStr(line.amount.amountMinor),
      direction: line.direction,
      partyType: line.partyType,
    };
  }
}
