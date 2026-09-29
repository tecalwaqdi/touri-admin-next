import { Suspense } from "react";
import { DriverCreatePage } from "@/features/drivers/DriverCreatePage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DriverCreatePage />
    </Suspense>
  );
}
