/** Shared Fake fixtures for Finance F1–F5 offline tests. */

export const FIXTURE_CASH_ORDER = {
  documentId: "ord_cash_1",
  data: {
    status: "completed",
    currency: "SAR",
    total_mndob2: 100,
    total: 100,
    total_app: 15,
    total_vat: 15,
    total_mndob: 70,
    PaymentMethod: "Cash",
    payment_status: "cash_collected",
    driver_id: "drv_1",
    country_id: "SA",
    agent_id: "agt_snap",
    agent_amount: 3,
    agent_rate: 20,
  },
};

export const FIXTURE_CARD_ORDER = {
  documentId: "ord_card_1",
  data: {
    status: "completed",
    currency: "SAR",
    total_mndob2: 100,
    total: 100,
    total_app: 15,
    total_vat: 15,
    total_mndob: 70,
    PaymentMethod: "OnlinePayment",
    payment_status: "paid",
    driver_id: "drv_1",
    country_id: "SA",
    agent_id: "agt_snap",
    agent_amount_minor: 300,
    agent_rate: 20,
  },
};

export const FIXTURE_MISSING_MAJOR_ORDER = {
  documentId: "ord_incomplete_1",
  data: {
    status: "completed",
    currency: "SAR",
    total_mndob2: 100,
    total: 100,
    total_app: 15,
    // total_vat missing
    // total_mndob missing
    PaymentMethod: "Cash",
    payment_status: "cash_collected",
    driver_id: "drv_1",
    country_id: "SA",
  },
};

export const FIXTURE_V2_SETTLEMENT = {
  documentId: "set_v2_1",
  data: {
    status: "locked",
    partyType: "driver",
    partyId: "drv_1",
    countryId: "SA",
    currency: "SAR",
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: 3000,
    paidConfirmedMinor: 0,
    createdByUserId: "acct_1",
    lockedByUserId: "apr_1",
    periodFromUtc: "2026-09-01T00:00:00.000Z",
    periodToUtc: "2026-09-07T00:00:00.000Z",
    claims: [
      {
        lineId: "drv_line_ord_cash_1",
        orderId: "ord_cash_1",
        amountMinor: 3000,
        currency: "SAR",
      },
    ],
  },
};
