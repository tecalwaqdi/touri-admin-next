"use client";

import { use } from "react";
import { SettlementDetailPage } from "@/features/settlements/SettlementDetailPage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SettlementDetailPage settlementId={id} />;
}
