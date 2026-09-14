export const CANONICAL_TRIP_STATUSES = [
  "requested",
  "waiting_driver",
  "accepted",
  "driver_en_route",
  "arrived",
  "started",
  "completed",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "under_dispute",
  "refunded",
] as const;

export type CanonicalTripStatus = (typeof CANONICAL_TRIP_STATUSES)[number];

export type PaymentMethod = "cash" | "online" | "card" | "unknown";

export type Trip = {
  id: string;
  customerId: string;
  customerName: string;
  driverId: string | null;
  driverName: string | null;
  agentId: string | null;
  countryId: string;
  cityId: string;
  status: CanonicalTripStatus;
  legacyStatus?: string;
  paymentMethod: PaymentMethod;
  currencyCode: string;
  grossFare: number | null;
  cashCollected: number | null;
  onlineCollected: number | null;
  createdAtUtc: string;
  completedAtUtc: string | null;
};
