"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { DetailNotEnabledState, ErrorState, LoadingState } from "@/components/states/QueryStates";
import { isProductionDetailDisabledResponse } from "@/domain/presentation/detailRouteSemantics";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { Agent, AgentAssignmentHistory } from "@/types/agent";
import type { QueryState } from "@/types/common";
import { useApiFetch } from "@/lib/apiClient";
import type { AgentFinanceSummary } from "@/domain/finance/reporting/FinanceReportingTypes";
import type { SettlementListItem } from "@/domain/finance/reporting/FinanceReportingTypes";
import { AgentWriteActions } from "@/features/agents/AgentWriteActions";

export function AgentDetailPage({ agentId }: { agentId: string }) {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<QueryState>("idle");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [history, setHistory] = useState<AgentAssignmentHistory[]>([]);
  const [settlements, setSettlements] = useState<SettlementListItem[]>([]);
  const [finance, setFinance] = useState<AgentFinanceSummary | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const load = async () => {
      setState("loading");
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
          setState("error");
          return;
        }
        if (!res.ok) throw new Error("Agent not found");
        const a = body as Agent & { history?: AgentAssignmentHistory[] };
        setAgent(a);
        const [histRes, setRes, finRes] = await Promise.all([
          apiFetch(`/api/agents/${agentId}?include=history`),
          apiFetch(`/api/finance/settlements?agentId=${agentId}&countryId=${a.countryId}`),
          apiFetch(
            `/api/finance/agents/${encodeURIComponent(agentId)}?countryId=${a.countryId}`,
          ),
        ]);
        if (histRes.ok) {
          const body = (await histRes.json()) as {
            history?: AgentAssignmentHistory[];
          };
          setHistory(body.history ?? []);
        }
        if (setRes.ok) {
          const body = (await setRes.json()) as { items: SettlementListItem[] };
          setSettlements(Array.isArray(body.items) ? body.items : []);
        }
        if (finRes.ok) {
          const body = (await finRes.json()) as Partial<AgentFinanceSummary>;
          if (body && body.metrics && typeof body.metrics === "object") {
            setFinance(body as AgentFinanceSummary);
          } else {
            setFinance(null);
          }
        }
        setState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"));
        setState("error");
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const attribution =
    finance && finance.metrics
      ? finance.metrics.attributionStatus
      : "unknown";

  return (
    <AdminShell title={t("agents")}>
      <PermissionGuard permission="agents:read">
        <Breadcrumb
          items={[
            { href: "/agents", label: t("agents") },
            { label: agentId },
          ]}
        />
        <div
          data-testid="synthetic-badge"
          className="mb-4 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
        >
          {t("syntheticData")} / بيانات تجريبية
        </div>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" && error === t("productionDetailNotEnabled") ? (
          <DetailNotEnabledState message={error} />
        ) : null}
        {state === "error" && error !== t("productionDetailNotEnabled") ? (
          <ErrorState message={error} />
        ) : null}
        {state === "success" && agent ? (
          <div data-testid="agent-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-slate-500">Name</dt>
                  <dd>{agent.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("country")}</dt>
                  <dd data-testid="agent-country">{agent.countryId}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("status")}</dt>
                  <dd data-testid="agent-status">
                    <StatusBadge value={agent.status === "active" ? "active" : "inactive"} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">FR7 attribution</dt>
                  <dd data-testid="agent-commission">{attribution}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Collected cash (FR7)</dt>
                  <dd data-testid="agent-cash-exposure">
                    {finance?.metrics ? (
                      <MoneyCell money={finance.metrics.collectedCash} />
                    ) : (
                      "Unknown"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Outstanding (FR7)</dt>
                  <dd data-testid="agent-payable">
                    {finance?.metrics ? (
                      <MoneyCell money={finance.metrics.outstanding} />
                    ) : (
                      "Unknown"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("driversCount")}</dt>
                  <dd>{agent.driversCount}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("tripsCount")}</dt>
                  <dd>{agent.tripsCount}</dd>
                </div>
              </dl>
            </div>
            <AgentWriteActions
              agent={agent}
              onUpdated={(next) => {
                setAgent(next);
              }}
            />
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Settlements (FR7)</h2>
              <ul data-testid="agent-settlements" className="text-sm">
                {settlements.length === 0 ? <li>{t("empty")}</li> : null}
                {settlements.map((s) => (
                  <li key={s.id}>
                    {s.id} — {s.status}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Assignment history</h2>
              <ul data-testid="agent-history" className="text-sm">
                {history.length === 0 ? (
                  <li>
                    Active from {agent.activeFromUtc ?? "—"} to {agent.activeToUtc ?? "present"}
                  </li>
                ) : (
                  history.map((h) => (
                    <li key={h.id}>
                      {h.previousAgentId ?? "—"} → {h.newAgentId} ({h.startedNewAtUtc})
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
