"use client";

import { Suspense } from "react";
import { SettlementsPage } from "@/features/settlements/SettlementsPage";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";

export default function Page() {
  return (
    <Suspense fallback={<SkeletonBlock rows={6} />}>
      <SettlementsPage />
    </Suspense>
  );
}
