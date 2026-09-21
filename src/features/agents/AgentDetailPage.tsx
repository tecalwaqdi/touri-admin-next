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
import type { Agent, AgentStatus } from "@/types/agent";
import type { QueryState } from "@/types/common";
import { useApiFetch } from "@/lib/apiClient";
import type { AgentDetailDto } from "@/application/production-read/detailDtos";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import { AgentWriteActions } from "@/features/agents/AgentWriteActions";
import { AgentEditPanel } from "@/features/agents/AgentEditPanel";
import { presentFinanceTerm } from "@/domain/presentation/financeTerminology";

type DetailUiState = QueryState | "not_found" | "unavailable" | "not_enabled";

function agentStatusFromDetail(data: AgentDetailDto): AgentStatus {
  if (data.status === "active") return "active";
  if (data.operationalActiveState === "suspended") return "suspended";
  return "inactive";
}

function agentFromDetail(data: AgentDetailDto): Agent {
  return {
    id: data.id,
    name: data.displayName ?? data.id,
    phone: data.phone,
    countryId: data.countryId ?? data.canonicalCountryId ?? "",
    status: agentStatusFromDetail(data),
    commissionPlaceholder: "—",
    driversCount: 0,
    tripsCount: 0,
    activeFromUtc: data.activeFromUtc,
    activeToUtc: data.activeToUtc,
    createdAtUtc: data.createdAtUtc ?? new Date(0).toISOString(),
  };
}

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
            t("dataSourceUnavailable"),
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
                    <Field label={t("name")}>
                      {data.displayName ?? t("missing")}
                    </Field>
                    <Field label={t("id")}>{data.id}</Field>
                    <Field label={t("status")}>
                      <span data-testid="agent-status">
                        <StatusBadge value={data.status} />
                      </span>
                    </Field>
                    <Field label={t("account")}>
                      {data.accountState ? (
                        <StatusBadge value={data.accountState} />
                      ) : (
                        t("unknown")
                      )}
                    </Field>
                    {(data as { phone?: string | null }).phone ? (
                      <Field label={t("phone")}>
                        {(data as { phone?: string | null }).phone}
                      </Field>
                    ) : null}
                  </>
                )}
                {section === "country" && (
                  <>
                    <Field label={t("country")}>
                      <span data-testid="agent-country">
                        {data.countryId ?? t("missing")}
                      </span>
                    </Field>
                    <Field label={t("canonical")}>
                      {data.canonicalCountryId ?? t("missing")}
                    </Field>
                    <Field label={t("bucket")}>
                      {data.countryBucket ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "invariant" && (
                  <>
                    <Field label={t("oneCountryOneAgent")}>
                      <StatusBadge value={data.countryInvariant} />
                    </Field>
                    <Field label={t("activePeers")}>
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
                    <Field label={t("activeFrom")}>
                      {data.activeFromUtc ?? t("missing")}
                    </Field>
                    <Field label={t("activeTo")}>
                      {data.activeToUtc ?? t("missing")}
                    </Field>
                    <Field label={t("createdAt")}>
                      {data.createdAtUtc ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "finance" && (
                  <>
                    <Field label={t("fr7Attribution")}>
                      <span data-testid="agent-commission">
                        {data.finance.attributionStatus ?? t("unavailable")}
                      </span>
                    </Field>
                    <Field label={presentFinanceTerm("collectedCash", locale as "en" | "ar")}>
                      <span data-testid="agent-cash-exposure">
                        {data.finance.availability === "available" &&
                        data.finance.collectedCash ? (
                          <MoneyCell money={data.finance.collectedCash} />
                        ) : (
                          t("unavailable")
                        )}
                      </span>
                    </Field>
                    <Field label={presentFinanceTerm("outstanding", locale as "en" | "ar")}>
                      <span data-testid="agent-payable">
                        {data.finance.availability === "available" &&
                        data.finance.outstanding ? (
                          <MoneyCell money={data.finance.outstanding} />
                        ) : (
                          t("unavailable")
                        )}
                      </span>
                    </Field>
                    <Field label={presentFinanceTerm("paid", locale as "en" | "ar")}>
                      {data.finance.availability === "available" &&
                      data.finance.paid ? (
                        <MoneyCell money={data.finance.paid} />
                      ) : (
                        t("unavailable")
                      )}
                    </Field>
                    <Field label={t("settlementsCount")}>
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
            <AgentEditPanel
              agent={agentFromDetail(data)}
              onUpdated={(next) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        displayName: next.name,
                        countryId: next.countryId,
                        canonicalCountryId: next.countryId,
                        activeFromUtc: next.activeFromUtc,
                        activeToUtc: next.activeToUtc,
                        phone: next.phone ?? null,
                      }
                    : prev,
                );
                setLegacy(next);
              }}
            />
            <AgentWriteActions
              agent={agentFromDetail(data)}
              countryMissing={!data.countryId && !data.canonicalCountryId}
              onUpdated={(next) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        status:
                          next.status === "active"
                            ? "active"
                            : next.status === "suspended"
                              ? "inactive"
                              : "inactive",
                        operationalActiveState: next.status,
                        activeFromUtc: next.activeFromUtc,
                        activeToUtc: next.activeToUtc,
                      }
                    : prev,
                );
              }}
            />
          </div>
        ) : null}
        {state === "success" && legacy ? (
          <div data-testid="agent-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label={t("name")}>{legacy.name}</Field>
                {legacy.phone ? (
                  <Field label={t("phone")}>{legacy.phone}</Field>
                ) : null}
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
            <AgentEditPanel
              agent={legacy}
              onUpdated={(next) => setLegacy(next)}
            />
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
