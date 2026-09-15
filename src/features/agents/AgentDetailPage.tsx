"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  DetailNotEnabledState,
  ErrorState,
  LoadingState,
  NotFoundState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { isProductionDetailDisabledResponse } from "@/domain/presentation/detailRouteSemantics";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { Agent } from "@/types/agent";
import type { QueryState } from "@/types/common";
import { useApiFetch } from "@/lib/apiClient";
import type { AgentDetailDto } from "@/application/production-read/detailDtos";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import { AgentWriteActions } from "@/features/agents/AgentWriteActions";

type DetailUiState = QueryState | "not_found" | "unavailable" | "not_enabled";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export function AgentDetailPage({ agentId }: { agentId: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<DetailUiState>("idle");
  const [data, setData] = useState<AgentDetailDto | null>(null);
  const [legacy, setLegacy] = useState<Agent | null>(null);
  const [error, setError] = useState<string>();
  const [section, setSection] = useState("overview");

  useEffect(() => {
    const load = async () => {
      setState("loading");
      setData(null);
      setLegacy(null);
      try {
        const res = await apiFetch(`/api/agents/${agentId}`);
        const body = await res.json().catch(() => ({}));
        if (
          isProductionDetailDisabledResponse({
            status: res.status,
            code: (body as { code?: string }).code,
            bodyText: JSON.stringify(body),
          })
        ) {
          setError(t("productionDetailNotEnabled"));
          setState("not_enabled");
          return;
        }
        if (res.status === 404) {
          setState("not_found");
          return;
        }
        if (res.status === 503) {
          setState("unavailable");
          setError(
            locale === "ar" ? "مصدر البيانات غير متاح" : "Data source unavailable",
          );
          return;
        }
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? t("error"));
        }
        if ((body as AgentDetailDto).kind === "agent") {
          setData(body as AgentDetailDto);
        } else if ((body as Agent).id) {
          setLegacy(body as Agent);
        } else {
          throw new Error(t("error"));
        }
        setState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"));
        setState("error");
      }
    };
    void load();
  }, [apiFetch, agentId, t, locale]);

  const sections = [
    "overview",
    "country",
    "invariant",
    "operational",
    "finance",
  ] as const;

  const source =
    data?.sourceLabel ??
    (legacy ? resolveAdminDataSourceLabel({ syntheticSource: true }) : null);

  return (
    <AdminShell title={t("agents")}>
      <PermissionGuard permission="agents:read">
        <Breadcrumb
          items={[
            { href: "/agents", label: t("agents") },
            { label: agentId },
          ]}
        />
        {source ? (
          <SourceLabelBadge
            testId="source-label-badge"
            source={{
              label: normalizeSourceLabelCode(source.label),
              code: normalizeSourceLabelCode(source.label),
              en: source.en,
              ar: source.ar,
              synthetic: source.synthetic,
            }}
          />
        ) : null}
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "not_enabled" ? (
          <DetailNotEnabledState message={error} />
        ) : null}
        {state === "not_found" ? <NotFoundState /> : null}
        {state === "unavailable" ? (
          <UnavailableState message={error} />
        ) : null}
        {state === "error" ? <ErrorState message={error} /> : null}
        {state === "success" && data ? (
          <div data-testid="agent-detail" className="space-y-4">
            {data.dataQualityWarnings.length > 0 ? (
              <ul
                data-testid="data-quality-warnings"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              >
                {data.dataQualityWarnings.map((w) => (
                  <li key={`${w.code}-${w.messageEn}`}>
                    {locale === "ar" ? w.messageAr : w.messageEn}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`tab-${s}`}
                  className={`rounded px-3 py-1 text-sm ${
                    section === s ? "bg-slate-900 text-white" : "bg-white border"
                  }`}
                  onClick={() => setSection(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                {section === "overview" && (
                  <>
                    <Field label="Name">
                      {data.displayName ?? t("missing")}
                    </Field>
                    <Field label="ID">{data.id}</Field>
                    <Field label={t("status")}>
                      <span data-testid="agent-status">
                        <StatusBadge value={data.status} />
                      </span>
                    </Field>
                    <Field label="Account">
                      {data.accountState ? (
                        <StatusBadge value={data.accountState} />
                      ) : (
                        t("unknown")
                      )}
                    </Field>
                  </>
                )}
                {section === "country" && (
                  <>
                    <Field label={t("country")}>
                      <span data-testid="agent-country">
                        {data.countryId ?? t("missing")}
                      </span>
                    </Field>
                    <Field label="Canonical">
                      {data.canonicalCountryId ?? t("missing")}
                    </Field>
                    <Field label="Bucket">
                      {data.countryBucket ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "invariant" && (
                  <>
                    <Field label="One country one agent">
                      <StatusBadge value={data.countryInvariant} />
                    </Field>
                    <Field label="Active peers">
                      {data.activePeerAgentIds.length
                        ? data.activePeerAgentIds.join(", ")
                        : t("empty")}
                    </Field>
                  </>
                )}
                {section === "operational" && (
                  <>
                    <Field label={t("operationalState")}>
                      {data.operationalActiveState ?? t("unknown")}
                    </Field>
                    <Field label={t("driversCount")}>{t("unavailable")}</Field>
                    <Field label={t("tripsCount")}>{t("unavailable")}</Field>
                    <Field label="Active from">
                      {data.activeFromUtc ?? t("missing")}
                    </Field>
                    <Field label="Active to">
                      {data.activeToUtc ?? t("missing")}
                    </Field>
                    <Field label={t("createdAt")}>
                      {data.createdAtUtc ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "finance" && (
                  <>
                    <Field label="FR7 attribution">
                      <span data-testid="agent-commission">
                        {data.finance.attributionStatus ?? t("unavailable")}
                      </span>
                    </Field>
                    <Field label="Collected cash (FR7)">
                      <span data-testid="agent-cash-exposure">
                        {data.finance.availability === "available" &&
                        data.finance.collectedCash ? (
                          <MoneyCell money={data.finance.collectedCash} />
                        ) : (
                          t("unavailable")
                        )}
                      </span>
                    </Field>
                    <Field label="Outstanding (FR7)">
                      <span data-testid="agent-payable">
                        {data.finance.availability === "available" &&
                        data.finance.outstanding ? (
                          <MoneyCell money={data.finance.outstanding} />
                        ) : (
                          t("unavailable")
                        )}
                      </span>
                    </Field>
                    <Field label="Paid (FR7)">
                      {data.finance.availability === "available" &&
                      data.finance.paid ? (
                        <MoneyCell money={data.finance.paid} />
                      ) : (
                        t("unavailable")
                      )}
                    </Field>
                    <Field label="Settlements">
                      <ul data-testid="agent-settlements" className="text-sm">
                        {data.settlements.length === 0 ? (
                          <li>{t("empty")}</li>
                        ) : (
                          data.settlements.map((s) => (
                            <li key={s.id}>
                              {s.id} — {s.status}
                            </li>
                          ))
                        )}
                      </ul>
                    </Field>
                  </>
                )}
              </dl>
            </div>
          </div>
        ) : null}
        {state === "success" && legacy ? (
          <div data-testid="agent-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">{legacy.name}</Field>
                <Field label={t("country")}>
                  <span data-testid="agent-country">{legacy.countryId}</span>
                </Field>
                <Field label={t("status")}>
                  <span data-testid="agent-status">
                    <StatusBadge
                      value={legacy.status === "active" ? "active" : "inactive"}
                    />
                  </span>
                </Field>
              </dl>
            </div>
            <AgentWriteActions
              agent={legacy}
              onUpdated={(next) => setLegacy(next)}
            />
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
