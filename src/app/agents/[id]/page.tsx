"use client";

import { use } from "react";
import { AgentDetailPage } from "@/features/agents/AgentDetailPage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AgentDetailPage agentId={id} />;
}
