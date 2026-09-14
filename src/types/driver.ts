export const REGISTRATION_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "needs_changes",
  "suspended",
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type ApprovalStatus = "pending" | "approved" | "rejected" | "suspended";
export type AvailabilityStatus = "offline" | "online" | "busy" | "unavailable";

export type Driver = {
  id: string;
  name: string;
  phone: string;
  email: string;
  countryId: string;
  cityId: string;
  agentId: string | null;
  registrationStatus: RegistrationStatus;
  approvalStatus: ApprovalStatus;
  availabilityStatus: AvailabilityStatus;
  vehiclePlate: string;
  rating: number | null;
  tripCount: number;
  createdAtUtc: string;
  lastSeenAtUtc: string | null;
};
