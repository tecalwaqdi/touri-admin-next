"use client";

import { use } from "react";
import { TripDetailPage } from "@/features/trips/TripDetailPage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripDetailPage tripId={id} />;
}
