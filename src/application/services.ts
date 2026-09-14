import { getRepositories } from "@/repositories/container";
import { SettlementService } from "@/application/settlements/SettlementService";
import { ReportService } from "@/application/reports/ReportService";
import { AuditService } from "@/audit/AuditService";
import { AgentCommandService } from "@/application/agents/AgentCommandService";
import { DashboardService } from "@/application/dashboard/DashboardService";
import { getDriverWriteApiService } from "@/application/drivers/DriverWriteApiService";
import { getAgentWriteApiService } from "@/application/agents/AgentWriteApiService";
import { getCustomerWriteApiService } from "@/application/customers/CustomerWriteApiService";

export function getSettlementService() {
  const repos = getRepositories();
  return new SettlementService(
    repos.settlements,
    repos.trips,
    repos.ledger,
    repos.agents,
    repos.drivers,
    new AuditService(repos.audit),
    repos.financialCalculation,
  );
}

export function getReportService() {
  const repos = getRepositories();
  return new ReportService(
    repos.trips,
    repos.settlements,
    repos.agents,
    repos.drivers,
    repos.financialCalculation,
    new AuditService(repos.audit),
  );
}

export function getAgentCommandService() {
  const repos = getRepositories();
  return new AgentCommandService(repos.agents, new AuditService(repos.audit));
}

export function getDashboardService() {
  const repos = getRepositories();
  return new DashboardService(repos.trips, repos.drivers, repos.customers);
}

export function getAuditService() {
  return new AuditService(getRepositories().audit);
}

export function getDriverWriteService() {
  return getDriverWriteApiService();
}

export function getAgentWriteService() {
  return getAgentWriteApiService();
}

export function getCustomerWriteService() {
  return getCustomerWriteApiService();
}
