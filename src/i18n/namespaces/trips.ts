export const tripsNs = {
  en: {
    registrationStatus: "Registration status",
    approvalStatus: "Approval status",
    availabilityStatus: "Availability status",
    cancelTripAction: "Cancel trip",
    confirmTripCancel:
      "Confirm {action} for trip {id} (current state: {state})? The customer will be able to book again.",
  },
  ar: {
    registrationStatus: "حالة التسجيل",
    approvalStatus: "حالة الاعتماد",
    availabilityStatus: "حالة التوفر",
    cancelTripAction: "إلغاء الرحلة",
    confirmTripCancel:
      "تأكيد {action} للرحلة {id} (الحالة الحالية: {state})؟ سيتمكن العميل من الحجز مجدداً.",
  },
} as const;
