"use client";

import { use } from "react";
import { CustomerDetailPage } from "@/features/customers/CustomerDetailPage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CustomerDetailPage customerId={id} />;
}
