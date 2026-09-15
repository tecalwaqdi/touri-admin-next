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
} from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import type { AuditEvent } from "@/types/audit";
import type { QueryState } from "@/types/common";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import { getClientAppEnv } from "@/lib/clientAppEnv";

export function AuditPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const isDev = getClientAppEnv() === "development";
  const [state, setState] = useState<QueryState>("idle");
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [error, setError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  // Do not default Production Audit to Development environment filter.
  const [environment, setEnvironment] = useState(isDev ? "development" : "");

  const load = async () => {
    setState("loading");
    setUnavailable(false);
    try {
      const qs = new URLSearchParams({ page: "1", pageSize: "50" });
      if (actor) qs.set("actor", actor);
      if (action) qs.set("action", action);
      if (resourceType) qs.set("resourceType", resourceType);
      if (environment) qs.set("environment", environment);
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
        setError(json.error);
        setState("error");
        return;
      }
      if (!res.ok) throw new Error("Failed to load audit");
      setItems(json.items);
      setState(json.items.length ? "success" : "empty");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setState("error");
    }
  };

  useEffect(() => {
    void load();
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
          source={resolveAdminDataSourceLabel({
            unavailable,
            syntheticSource: !unavailable && state === "success",
          })}
        />
        {!unavailable ? (
          <div className="mb-4 grid gap-2 sm:grid-cols-4">
            <input
              data-testid="audit-actor-filter"
              className="rounded border px-2 py-1 text-sm"
              placeholder="Actor"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
            <input
              data-testid="audit-action-filter"
              className="rounded border px-2 py-1 text-sm"
              placeholder="Action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <input
              className="rounded border px-2 py-1 text-sm"
              placeholder="Resource type"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
            />
            {isDev ? (
              <input
                className="rounded border px-2 py-1 text-sm"
                placeholder="Environment"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
              />
            ) : null}
          </div>
        ) : null}
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {unavailable ? (
          <SourceNotConfiguredState message={notConfiguredMessage} />
        ) : null}
        {state === "error" && !unavailable ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div
              data-testid="audit-list"
              className="overflow-auto rounded-lg border bg-white"
            >
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Actor</th>
                    <th className="px-3 py-2">Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ev) => (
                    <tr
                      key={ev.auditId}
                      className="cursor-pointer border-t hover:bg-slate-50"
                      onClick={() => setSelected(ev)}
                    >
                      <td className="px-3 py-2">{ev.createdAtUtc}</td>
                      <td className="px-3 py-2">{ev.action}</td>
                      <td className="px-3 py-2">{ev.actorUserId}</td>
                      <td className="px-3 py-2">
                        {ev.resourceType}:{ev.resourceId ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              data-testid="audit-detail"
              className="rounded-lg border bg-white p-4 text-sm"
            >
              {selected ? (
                <dl className="space-y-2">
                  <div>
                    <dt className="text-slate-500">Audit ID</dt>
                    <dd>{selected.auditId}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Correlation</dt>
                    <dd>{selected.correlationId}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Reason</dt>
                    <dd>{selected.reason ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Before</dt>
                    <dd>
                      <pre className="overflow-auto text-xs">
                        {JSON.stringify(selected.beforeSnapshot ?? null, null, 2)}
                      </pre>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">After</dt>
                    <dd>
                      <pre className="overflow-auto text-xs">
                        {JSON.stringify(selected.afterSnapshot ?? null, null, 2)}
                      </pre>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-slate-500">Select an event</p>
              )}
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
