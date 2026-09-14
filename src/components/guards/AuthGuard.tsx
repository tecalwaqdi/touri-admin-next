"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/AuthContext";
import { LoadingState, ForbiddenState, ErrorState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (session.state === "unauthenticated") {
      router.replace("/login");
    }
  }, [session.state, router]);

  if (session.state === "initializing" || session.state === "authorizing") {
    return <LoadingState />;
  }

  if (session.state === "error") {
    return <ErrorState message={session.errorMessage ?? t("error")} />;
  }

  if (session.state === "forbidden") {
    return (
      <ForbiddenState
        message={
          session.user?.status === "disabled"
            ? t("accountDisabled")
            : session.errorMessage ?? t("unauthorized")
        }
      />
    );
  }

  if (session.state !== "authorized" || !session.user) {
    return <LoadingState />;
  }

  return <>{children}</>;
}
