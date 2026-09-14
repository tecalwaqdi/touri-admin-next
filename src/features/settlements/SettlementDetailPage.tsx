"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { ErrorState, LoadingState } from "@/components/states/QueryStates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import type { SettlementDetailReadModel } from "@/domain/finance/reporting/FinanceReportingTypes";
import type { QueryState } from "@/types/common";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";

/**
 * Settlement DETAIL — FR7 SettlementDetailReadModel (same authoritative values as list).
 * No React money calculation. Write path remains SettlementCommandService (separate).
 */
export function SettlementDetailPage({ settlementId }: { settlementId: string }) {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<QueryState>("idle");
  const [detail, setDetail] = useState<SettlementDetailReadModel | null>(null);
  const [error, setError] = useState<string>();

  const load = async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/api/finance/settlements/${settlementId}`);
      if (res.status === 401 || res.status === 403) {
        throw new Error(t("forbidden"));
      }
      if (res.status === 404) throw new Error("Settlement not found");
      if (!res.ok) throw new Error("Failed to load FR7 settlement detail");
      setDetail((await res.json()) as SettlementDetailReadModel);
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setState("error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementId]);

  return (
    <AdminShell title={t("settlements")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/settlements", label: t("settlements") },
            { label: settlementId },
          ]}
        />
        <div
          data-testid="fr7-source-badge"
          className="mb-4 inline-flex rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900"
        >
          FR7 settlement detail
        </div>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "success" && detail ? (
          <div data-testid="settlement-detail" className="space-y-4">
            <div className="rounded-lg border bg-white p-4">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-sm text-slate-500">ID</dt>
                  <dd data-testid="settlement-id">{detail.id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("status")}</dt>
                  <dd data-testid="settlement-status">
                    <StatusBadge value={detail.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Party</dt>
                  <dd>
                    {detail.partyType}:{detail.partyIdToken}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("country")}</dt>
                  <dd data-testid="settlement-country">{detail.countryId}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Direction</dt>
                  <dd>{detail.direction}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Period</dt>
                  <dd>
                    {detail.periodFromUtc ?? "—"} → {detail.periodToUtc ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Currency</dt>
                  <dd>{detail.currency}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Amount</dt>
                  <dd data-testid="settlement-amount" className="tabular-nums">
                    {detail.amountMinor == null
                      ? "Unknown"
                      : formatMinorUnitsDisplay(
                          detail.amountMinor,
                          detail.currency,
                        )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Paid confirmed</dt>
                  <dd data-testid="settlement-paid" className="tabular-nums">
                    {detail.paidConfirmedMinor == null
                      ? "Unknown"
                      : formatMinorUnitsDisplay(
                          detail.paidConfirmedMinor,
                          detail.currency,
                        )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Outstanding</dt>
                  <dd
                    data-testid="settlement-outstanding"
                    className="tabular-nums"
                  >
                    {detail.outstandingMinor == null
                      ? "Unknown"
                      : formatMinorUnitsDisplay(
                          detail.outstandingMinor,
                          detail.currency,
                        )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Source snapshot</dt>
                  <dd>{detail.sourceSnapshotId ?? "—"}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Claims (FR7)</h2>
              <ul data-testid="settlement-claims" className="space-y-1 text-sm">
                {detail.claims.map((c) => (
                  <li key={c.lineId}>
                    {c.lineId} / {c.orderIdToken}:{" "}
                    {c.amountMinor == null
                      ? "Unknown"
                      : formatMinorUnitsDisplay(c.amountMinor, c.currency)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Payments (FR7)</h2>
              <ul data-testid="settlement-payments" className="space-y-1 text-sm">
                {detail.payments.map((p) => (
                  <li key={p.id}>
                    {p.id}: {p.status} —{" "}
                    {p.amountMinor == null
                      ? "Unknown"
                      : formatMinorUnitsDisplay(p.amountMinor, p.currency)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Approved adjustments (FR7)</h2>
              <ul
                data-testid="settlement-adjustments"
                className="space-y-1 text-sm"
              >
                {detail.approvedAdjustments.length === 0 ? (
                  <li>None</li>
                ) : (
                  detail.approvedAdjustments.map((a) => (
                    <li key={a.id}>
                      {a.id}: {a.direction} — monetaryEffect=
                      {String(a.monetaryEffect)} — impact=
                      {a.signedCompanyClaimImpactMinor ?? "—"}
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
