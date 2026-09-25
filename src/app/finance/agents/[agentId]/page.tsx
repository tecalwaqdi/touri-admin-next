import { Suspense } from "react";
import { AgentAccountDetailPage } from "@/features/finance/AgentAccountDetailPage";

export default function AgentAccountDetailRoutePage() {
  return (
    <Suspense fallback={null}>
      <AgentAccountDetailPage />
    </Suspense>
  );
}
