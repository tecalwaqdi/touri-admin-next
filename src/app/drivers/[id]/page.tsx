"use client";

import { use } from "react";
import { DriverDetailPage } from "@/features/drivers/DriverDetailPage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DriverDetailPage driverId={id} />;
}
