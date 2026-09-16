"use client";

import { RegionDetailPage } from "@/features/geography/RegionsTab";
import { use } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RegionDetailPage id={id} />;
}
