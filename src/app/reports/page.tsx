"use client";

import { Suspense } from "react";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";

export default function Page() {
  return (
    <Suspense fallback={<SkeletonBlock rows={6} />}>
      <ReportsPage />
    </Suspense>
  );
}
