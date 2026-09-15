"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SourceNotConfiguredState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import type { AuditEvent } from "@/types/audit";
import type { QueryState } from "@/types/common";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import { getClientAppEnv } from "@/lib/clientAppEnv";
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import { DisclosureBlock } from "@/components/ui/DisclosureBlock";
import { FilterBar } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import { DetailField } from "@/components/ui/DetailSection";

export function AuditPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const isDev = getClientAppEnv() === "development";
  const [state, setState] = useState<QueryState>("idle");
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [error, setError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [unavailableCode, setUnavailableCode] = useState<string | undefined>();
  const [sourceLabel, setSourceLabel] = useState<{
    label: string;
    en: string;
    ar: string;
    synthetic: boolean;
  } | null>(null);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  // Do not default Production Audit to Development environment filter.
  const [environment, setEnvironment] = useState(isDev ? "development" : "");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = async (pageCursor: string | null = null) => {
    setState("loading");
    setUnavailable(false);
    try {
      const qs = new URLSearchParams({ pageSize: "20" });
      if (actor) qs.set("actor", actor);
      if (action) qs.set("action", action);
      if (resourceType) qs.set("resourceType", resourceType);
      if (environment) qs.set("environment", environment);
      if (pageCursor) qs.set("cursor", pageCursor);
      const res = await apiFetch(`/api/audit?${qs}`);
      if (res.status === 403) {
        setError(t("forbidden"));
        setState("error");
        return;
      }
      const json = (await res.json()) as {
        items: AuditEvent[];
        unavailable?: boolean;
        error?: string;
        code?: string;
        nextCursor?: string | null;
        sourceLabel?: {
          label: string;
          en: string;
          ar: string;
          synthetic: boolean;
        };
      };
      if (res.status === 503 || json.unavailable) {
        setItems([]);
        setUnavailable(true);
        setUnavailableCode(json.code);
        setError(json.error);
        setSourceLabel(json.sourceLabel ?? null);
        setState("error");
        return;
      }
      if (!res.ok) throw new Error(t("error"));
      setItems(json.items);
      setNextCursor(json.nextCursor ?? null);
      setCursor(pageCursor);
      setSourceLabel(json.sourceLabel ?? null);
      setState(json.items.length ? "success" : "empty");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setState("error");
    }
  };

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, action, resourceType, environment]);

  const notConfiguredMessage =
    locale === "ar"
      ? t("productionAuditSourceNotConfigured")
      : t("productionAuditSourceNotConfigured");

  return (
    <AdminShell title={t("audit")}>
      <PermissionGuard permission="audit:read">
        <Breadcrumb items={[{ label: t("audit") }]} />
        <SourceLabelBadge
          testId="synthetic-badge"
          source={
            sourceLabel
              ? {
                  label: normalizeSourceLabelCode(sourceLabel.label),
                  code: normalizeSourceLabelCode(sourceLabel.label),
                  en: sourceLabel.en,
                  ar: sourceLabel.ar,
                  synthetic: sourceLabel.synthetic,
                }
              : resolveAdminDataSourceLabel({
                  unavailable,
                  syntheticSource: !unavailable && state === "success",
                })
          }
        />
        <p className={adminUi.caption}>{t("auditCwHint")}</p>
        {!unavailable ? (
          <FilterBar>
            <input
              data-testid="audit-actor-filter"
              className={adminUi.filterControl}
              placeholder={t("actor")}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
            <input
              data-testid="audit-action-filter"
              className={adminUi.filterControl}
              placeholder={t("action")}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <input
              className={adminUi.filterControl}
              placeholder={t("resourceType")}
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
            />
            {isDev ? (
              <input
                className={adminUi.filterControl}
                placeholder={t("environment")}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
              />
            ) : null}
          </FilterBar>
        ) : null}
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {unavailable ? (
          unavailableCode === "PRODUCTION_AUDIT_SOURCE_NOT_CONFIGURED" ? (
            <SourceNotConfiguredState message={notConfiguredMessage} />
          ) : (
            <UnavailableState message={error ?? t("unavailable")} />
          )
        ) : null}
        {state === "error" && !unavailable ? (
          <ErrorState message={error} onRetry={() => void load(cursor)} />
        ) : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminDataTable
              testId="audit-list"
              dense
              footer={
                <div className="flex justify-end gap-2 border-t px-3 py-2">
                  <button
                    type="button"
                    className={`${adminUi.btnSecondary} disabled:opacity-40`}
                    disabled={!nextCursor}
                    onClick={() => void load(nextCursor)}
                  >
                    {t("next")}
                  </button>
                </div>
              }
            >
              <AdminTableHead>
                <tr>
                  <AdminTh>{t("time")}</AdminTh>
                  <AdminTh>{t("action")}</AdminTh>
                  <AdminTh>{t("actor")}</AdminTh>
                  <AdminTh>{t("resource")}</AdminTh>
                </tr>
              </AdminTableHead>
              <tbody>
                {items.map((ev) => (
                  <AdminTr key={ev.auditId} onClick={() => setSelected(ev)}>
                    <AdminTd>
                      <FormattedDateTime value={ev.createdAtUtc} />
                    </AdminTd>
                    <AdminTd className={adminUi.truncate} title={ev.action}>
                      {ev.action}
                    </AdminTd>
                    <AdminTd>
                      <LtrIsolate className={adminUi.monoId}>
                        {ev.actorUserId}
                      </LtrIsolate>
                    </AdminTd>
                    <AdminTd className={adminUi.truncate}>
                      {ev.resourceType}:
                      <LtrIsolate className={adminUi.monoId}>
                        {ev.resourceId ?? "—"}
                      </LtrIsolate>
                    </AdminTd>
                  </AdminTr>
                ))}
              </tbody>
            </AdminDataTable>
            <div data-testid="audit-detail" className={adminUi.cardPad}>
              {selected ? (
                <div className="space-y-3 text-sm">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <DetailField label={t("auditId")}>
                      <LtrIsolate className={adminUi.monoId}>
                        {selected.auditId}
                      </LtrIsolate>
                    </DetailField>
                    <DetailField label={t("correlation")}>
                      <LtrIsolate className={adminUi.monoId}>
                        {selected.correlationId}
                      </LtrIsolate>
                    </DetailField>
                    <DetailField label={t("reason")}>
                      {selected.reason ?? "—"}
                    </DetailField>
                  </dl>
                  <DisclosureBlock
                    testId="audit-before-disclosure"
                    summary={t("showTechnicalDetails") + ` — ${t("before")}`}
                  >
                    <pre className="overflow-auto text-xs">
                      {JSON.stringify(selected.beforeSnapshot ?? null, null, 2)}
                    </pre>
                  </DisclosureBlock>
                  <DisclosureBlock
                    testId="audit-after-disclosure"
                    summary={t("showTechnicalDetails") + ` — ${t("after")}`}
                  >
                    <pre className="overflow-auto text-xs">
                      {JSON.stringify(selected.afterSnapshot ?? null, null, 2)}
                    </pre>
                  </DisclosureBlock>
                </div>
              ) : (
                <p className="text-slate-500">{t("selectEvent")}</p>
              )}
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
