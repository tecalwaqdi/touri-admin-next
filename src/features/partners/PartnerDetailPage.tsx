"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  ErrorState,
  LoadingState,
  NotFoundState,
} from "@/components/states/QueryStates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import { DetailField } from "@/components/ui/DetailSection";
import { CityCell, CountryCell } from "@/components/ui/GeoReferenceCells";
import { PrimaryWithTechnicalId } from "@/components/ui/PrimaryWithTechnicalId";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import type { MessageKey } from "@/i18n/messages";

type PartnerDetail = {
  kind: "partner";
  partnerLandmarkId: string;
  displayName: string | null;
  displayNameAr?: string | null;
  displayNameEn?: string | null;
  countryId: string | null;
  cityId: string | null;
  regionId?: string | null;
  activeStatus: string;
  mappingStatus?: string | null;
  contactPhoneHint?: string | null;
  contactEmailHint?: string | null;
  addressText?: string | null;
  operationalNotes?: string | null;
  imageSlotsPresent?: number;
  coordinates?: { latitude: number; longitude: number } | null;
};

type PartnerAction = {
  kind: "activate" | "deactivate" | "archive";
  label: MessageKey;
};

export function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success" | "not_found">(
    "loading",
  );
  const [error, setError] = useState<string>();
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [confirming, setConfirming] = useState<PartnerAction | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      !!session.user &&
      hasPermission(session.user.permissions, "agents:manage") &&
      isControlledWriteChromeEnabled(),
    [session.user],
  );

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/api/partners/${encodeURIComponent(id)}`);
      if (res.status === 404) {
        setState("not_found");
        return;
      }
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as { item?: PartnerDetail };
      if (!json.item) {
        setState("not_found");
        return;
      }
      setDetail(json.item);
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setState("error");
    }
  }, [apiFetch, id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName =
    detail == null
      ? id
      : locale === "ar"
        ? (detail.displayNameAr ?? detail.displayName)
        : (detail.displayNameEn ?? detail.displayName);

  const legalActions = (): PartnerAction[] => {
    if (!detail) return [];
    const actions: PartnerAction[] = [];
    if (detail.activeStatus !== "active") {
      actions.push({ kind: "activate", label: "activateAction" });
    }
    if (detail.activeStatus !== "inactive") {
      actions.push({ kind: "deactivate", label: "deactivateAction" });
    }
    actions.push({ kind: "archive", label: "geographyArchiveAction" });
    return actions;
  };

  const runAction = async (action: PartnerAction) => {
    if (!detail || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setActionError(undefined);
    try {
      const res = await apiFetch(
        `/api/partners/${encodeURIComponent(detail.partnerLandmarkId)}/${action.kind}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: detail.partnerLandmarkId,
            reasonCode: "operational",
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        setActionError(json.message ?? json.error ?? t("error"));
        return;
      }
      setConfirming(null);
      await load();
    } catch {
      setActionError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <AdminShell title={t("partners")}>
      <Breadcrumb
        items={[
          { label: t("partners"), href: "/partners" },
          { label: displayName ?? id },
        ]}
      />
      {state === "loading" ? <LoadingState /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "not_found" ? <NotFoundState /> : null}
      {state === "success" && detail ? (
        <div className="mt-4 space-y-4" data-testid="partner-detail">
          <dl className={`${adminUi.cardPad} grid gap-3 sm:grid-cols-2`}>
            <DetailField label={t("name")}>
              <PrimaryWithTechnicalId
                primary={displayName ?? detail.partnerLandmarkId}
                technicalId={detail.partnerLandmarkId}
                emptyLabel={t("unavailable")}
              />
            </DetailField>
            <DetailField label={t("status")}>
              <StatusBadge value={detail.activeStatus} />
            </DetailField>
            <DetailField label={t("country")}>
              <CountryCell countryId={detail.countryId} />
            </DetailField>
            <DetailField label={t("city")}>
              <CityCell cityId={detail.cityId} />
            </DetailField>
            <DetailField label={t("contactLocation")}>
              {detail.contactPhoneHint ?? detail.contactEmailHint ?? t("unavailable")}
            </DetailField>
            <DetailField label={t("geography")}>
              {detail.addressText ?? t("unavailable")}
            </DetailField>
            <DetailField label={t("operationalState")}>
              {detail.operationalNotes ?? t("unavailable")}
            </DetailField>
            <DetailField label={t("mapping")}>
              {detail.coordinates
                ? `${detail.coordinates.latitude.toFixed(5)}, ${detail.coordinates.longitude.toFixed(5)}`
                : t("unavailable")}
            </DetailField>
          </dl>
          {canWrite ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {legalActions().map((action) => (
                  <button
                    key={action.kind}
                    type="button"
                    className={adminUi.btnGhost}
                    disabled={pending}
                    onClick={() => setConfirming(action)}
                  >
                    {t(action.label)}
                  </button>
                ))}
              </div>
              {confirming ? (
                <ControlledWriteConfirmPanel
                  testIdPrefix={`partner-detail-${confirming.kind}`}
                  confirmTemplateKey="confirmAgentWrite"
                  actionLabelKey={confirming.label}
                  targetId={displayName ?? detail.partnerLandmarkId}
                  stateLabel={detail.activeStatus}
                  pending={pending}
                  onConfirm={() => void runAction(confirming)}
                  onCancel={() => setConfirming(null)}
                />
              ) : null}
              {actionError ? (
                <p className="text-sm text-rose-700" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>
          ) : null}
          <Link className="text-emerald-700 underline" href="/partners">
            {t("partners")}
          </Link>
        </div>
      ) : null}
    </AdminShell>
  );
}
