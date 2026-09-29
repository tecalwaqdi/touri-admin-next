/**
 * Live-adjacent cutover inventory dry-run script.
 * Loads bounded FR7 Production RO window and prints dry-run report.
 * NEVER writes. NEVER deletes.
 *
 *   FINANCE_CUTOVER_DATE=2026-10-01 \
 *   FINANCE_FR7_PRODUCTION_RO_VALIDATE=1 \
 *   FINANCE_WRITE_ENABLED=false \
 *   node --import tsx scripts/finance-cutover-inventory-dry-run.mts
 */

import { createFirebaseFinanceReportingRoFirestorePort } from "../src/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort.ts";
import { ProductionFinanceReportingReadAdapter } from "../src/adapters/finance/reporting/ProductionFinanceReportingReadAdapter.ts";
import { runFinanceCutoverInventoryDryRun } from "../src/application/finance/cutover/FinanceCutoverInventoryDryRun.ts";

async function main() {
  if (process.env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error("Refuse: FINANCE_WRITE_ENABLED must be false");
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error("Refuse: GOOGLE_APPLICATION_CREDENTIALS forbidden");
  }

  const firestore = await createFirebaseFinanceReportingRoFirestorePort();
  const adapter = new ProductionFinanceReportingReadAdapter(firestore);
  const loaded = await adapter.load();
  if (loaded.productionWrites !== 0 || loaded.firestoreMutations !== 0) {
    throw new Error("SAFETY: unexpected writes during load");
  }

  const report = runFinanceCutoverInventoryDryRun({
    bundle: loaded.bundle,
    cutoverDate: process.env.FINANCE_CUTOVER_DATE || null,
    approved: process.env.FINANCE_CUTOVER_APPROVED || false,
    boundedWindow: true,
  });

  const summary = {
    dryRun: report.dryRun,
    productionWrites: report.productionWrites,
    deletions: report.deletions,
    cutover: report.cutover,
    scan: report.scan,
    counts: report.counts,
    idsByClass: report.idsByClass,
    openingBalances: {
      driverCount: report.openingBalances.driverOpeningBalances.length,
      agentCount: report.openingBalances.agentOpeningBalances.length,
      companyNetOpening: report.openingBalances.companyNetOpening,
      proposals: report.openingBalances.proposals,
      unresolvedCount: report.openingBalances.unresolved.length,
      unresolvedSample: report.openingBalances.unresolved.slice(0, 20),
    },
    qa: report.qa,
    safety: report.safety,
    archivePlan: report.archivePlan,
    newPeriodPlan: report.newPeriodPlan,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
