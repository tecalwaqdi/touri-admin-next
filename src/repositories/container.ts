import { InMemoryAgentRepository } from "@/repositories/in-memory/InMemoryAgentRepository";
import { InMemoryAuditRepository, sharedAuditRepository } from "@/repositories/in-memory/InMemoryAuditRepository";
import { InMemoryCustomerRepository } from "@/repositories/in-memory/InMemoryCustomerRepository";
import { InMemoryDriverRepository } from "@/repositories/in-memory/InMemoryDriverRepository";
import { InMemoryFinanceRepository } from "@/repositories/in-memory/InMemoryFinanceRepository";
import { InMemorySettlementRepository } from "@/repositories/in-memory/InMemorySettlementRepository";
import { InMemoryTripRepository } from "@/repositories/in-memory/InMemoryTripRepository";
import { InMemoryUserRepository } from "@/repositories/in-memory/InMemoryUserRepository";
import { InMemoryLedgerRepository } from "@/repositories/in-memory/InMemoryLedgerRepository";
import { SyntheticFinancialPolicyProvider } from "@/domain/finance/SyntheticFinancialPolicy";
import { FinancialCalculationService } from "@/domain/finance/FinancialCalculationService";

export type AppRepositories = {
  trips: InMemoryTripRepository;
  drivers: InMemoryDriverRepository;
  customers: InMemoryCustomerRepository;
  agents: InMemoryAgentRepository;
  finance: InMemoryFinanceRepository;
  settlements: InMemorySettlementRepository;
  audit: InMemoryAuditRepository;
  users: InMemoryUserRepository;
  ledger: InMemoryLedgerRepository;
  financialPolicy: SyntheticFinancialPolicyProvider;
  financialCalculation: FinancialCalculationService;
};

let singleton: AppRepositories | null = null;

export function getRepositories(): AppRepositories {
  if (!singleton) {
    const financialPolicy = new SyntheticFinancialPolicyProvider();
    singleton = {
      trips: new InMemoryTripRepository(),
      drivers: new InMemoryDriverRepository(),
      customers: new InMemoryCustomerRepository(),
      agents: new InMemoryAgentRepository(),
      finance: new InMemoryFinanceRepository(),
      settlements: new InMemorySettlementRepository(),
      audit: sharedAuditRepository,
      users: new InMemoryUserRepository(),
      ledger: new InMemoryLedgerRepository(),
      financialPolicy,
      financialCalculation: new FinancialCalculationService(financialPolicy),
    };
  }
  return singleton;
}

export function resetRepositoriesForTests(): void {
  singleton = null;
  sharedAuditRepository.resetToSeed();
}
