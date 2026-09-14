/**
 * Synthetic Chart of Accounts — NON-PRODUCTION.
 * Do not map these codes to production ledgers.
 */
export const SYNTHETIC_COA = {
  "SYN-CASH": { code: "SYN-CASH", name: "Synthetic Cash", type: "asset" },
  "SYN-BANK": { code: "SYN-BANK", name: "Synthetic Bank", type: "asset" },
  "SYN-GATEWAY-CLEARING": {
    code: "SYN-GATEWAY-CLEARING",
    name: "Synthetic Gateway Clearing",
    type: "asset",
  },
  "SYN-DRIVER-PAYABLE": {
    code: "SYN-DRIVER-PAYABLE",
    name: "Synthetic Driver Payable",
    type: "liability",
  },
  "SYN-AGENT-PAYABLE": {
    code: "SYN-AGENT-PAYABLE",
    name: "Synthetic Agent Payable",
    type: "liability",
  },
  "SYN-PLATFORM-REVENUE": {
    code: "SYN-PLATFORM-REVENUE",
    name: "Synthetic Platform Revenue",
    type: "revenue",
  },
  "SYN-VAT-PAYABLE": {
    code: "SYN-VAT-PAYABLE",
    name: "Synthetic VAT Payable",
    type: "liability",
  },
  "SYN-REFUND-LIABILITY": {
    code: "SYN-REFUND-LIABILITY",
    name: "Synthetic Refund Liability",
    type: "liability",
  },
  "SYN-CHARGEBACK": {
    code: "SYN-CHARGEBACK",
    name: "Synthetic Chargeback",
    type: "expense",
  },
  "SYN-ADJUSTMENT": {
    code: "SYN-ADJUSTMENT",
    name: "Synthetic Adjustment",
    type: "equity",
  },
  "SYN-SETTLEMENT-CLEARING": {
    code: "SYN-SETTLEMENT-CLEARING",
    name: "Synthetic Settlement Clearing",
    type: "liability",
  },
} as const;

export type SyntheticAccountCode = keyof typeof SYNTHETIC_COA;

export const SYNTHETIC_COA_PRODUCTION = false as const;
