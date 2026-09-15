"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ForbiddenState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { SettlementListItem } from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  formatMinorUnitsDisplay,
} from "@/features/finance/formatReportMoney";
import {
  presentFinanceTerm,
  presentMoneyAvailability,
  presentSettlementDirection,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { presentStatus } from "@/domain/presentation/statusPresentation";

export function SettlementsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const { session } = useAuth();
  const [status, setStatus] = useState("");
  const [countryId, setCountryId] = useState("");
  const [direction, setDirection] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const canCreate = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "settlements:create")
        : false,
    [session.user],
  );

  const queryKey = useMemo(
    () => `fr7-settlements:${status}:${countryId}:${direction}`,
    [status, countryId, direction],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (status) qs.set("settlementStatus", status);
      if (countryId) qs.set("countryId", countryId);
      if (direction) qs.set("settlementDirection", direction);
      const res = await apiFetch(`/api/finance/settlements?${qs}`, { signal });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      const json = (await res.json()) as {
        items: SettlementListItem[];
        synthetic?: boolean;
        sourceLabel?: {
          label: string;
          en: string;
          ar: string;
          synthetic: boolean;
        };
      };
      return json;
    },
    [apiFetch, status, countryId, direction, finLocale],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (payload) => payload.items.length === 0,
  });

  const source = data?.sourceLabel
    ? {
        label: normalizeSourceLabelCode(data.sourceLabel.label),
        code: normalizeSourceLabelCode(data.sourceLabel.label),
        en: data.sourceLabel.en,
        ar: data.sourceLabel.ar,
        synthetic: data.sourceLabel.synthetic,
      }
    : resolveAdminDataSourceLabel({
        syntheticSource: data?.synthetic !== false,
        productionFirestore: data?.synthetic === false,
        documentIds: data?.items.map((i) => i.id) ?? [],
      });

  return (
    <AdminShell title={t("settlements")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb items={[{ label: t("settlements") }]} />
        <div
          data-testid="fr7-source-badge"
          className="mb-4 inline-flex rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900"
        >
          {t("fr7Authoritative")}
        </div>
        <SourceLabelBadge testId="synthetic-badge" source={source} />
        {source.code === "production_pilot" ? (
          <p
            data-testid="settlements-pilot-notice"
            className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
          >
            {presentFinanceTerm("pilotNotice", finLocale)}
          </p>
        ) : null}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            {presentFinanceTerm("status", finLocale)}
            <select
              data-testid="settlement-status-filter"
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{presentFinanceTerm("all", finLocale)}</option>
              {(
                [
                  "draft",
                  "locked",
                  "partially_paid",
                  "settled",
                  "disputed",
                  "voided",
                ] as const
              ).map((s) => (
                <option key={s} value={s}>
                  {presentStatus(s, finLocale)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {presentFinanceTerm("direction", finLocale)}
            <select
              data-testid="settlement-direction-filter"
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="">{presentFinanceTerm("all", finLocale)}</option>
              {(
                [
                  "DRIVER_PAYS_COMPANY",
                  "COMPANY_PAYS_DRIVER",
                  "AGENT_PAYS_COMPANY",
                  "COMPANY_PAYS_AGENT",
                ] as const
              ).map((d) => (
                <option key={d} value={d}>
                  {presentSettlementDirection(d, finLocale)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {presentFinanceTerm("country", finLocale)}
            <div className="mt-1">
              <FinanceCountryFilterSelect
                value={countryId}
                onChange={setCountryId}
                locale={locale}
                allLabel={t("allCountries")}
                testId="settlements-country-filter"
                className="block rounded border border-slate-300 px-2 py-1"
              />
            </div>
          </label>
          {canCreate ? (
            <Link
              href="/settlements/new"
              className="rounded bg-emerald-700 px-3 py-2 text-sm text-white"
            >
              {presentFinanceTerm("new", finLocale)}
            </Link>
          ) : null}
        </div>

        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {forbidden ? (
          <ForbiddenState
            message={presentFinanceTerm("financeForbidden", finLocale)}
          />
        ) : null}
        {state === "error" && !forbidden ? (
          <UnavailableState message={error} />
        ) : null}
        {state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}
        {state === "success" && data ? (
          <div
            data-testid="settlements-list"
            dir={locale === "ar" ? "rtl" : "ltr"}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("settlementId", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("party", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("country", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("currency", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("direction", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("settlementAmount", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("confirmedPaid", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("outstanding", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("status", finLocale)}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {presentFinanceTerm("details", finLocale)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.id}</td>
                    <td className="px-4 py-3">
                      {row.partyType}:{row.partyIdToken}
                    </td>
                    <td className="px-4 py-3">{row.countryId}</td>
                    <td className="px-4 py-3">{row.currency}</td>
                    <td className="px-4 py-3">
                      {presentSettlementDirection(row.direction, finLocale)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.amountMinor == null
                        ? presentMoneyAvailability("unknown", finLocale)
                        : formatMinorUnitsDisplay(
                            row.amountMinor,
                            row.currency,
                          )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.paidConfirmedMinor == null
                        ? presentMoneyAvailability("unknown", finLocale)
                        : formatMinorUnitsDisplay(
                            row.paidConfirmedMinor,
                            row.currency,
                          )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.outstandingMinor == null
                        ? presentMoneyAvailability("unknown", finLocale)
                        : formatMinorUnitsDisplay(
                            row.outstandingMinor,
                            row.currency,
                          )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-emerald-700 underline"
                        href={`/settlements/${row.id}`}
                      >
                        {presentFinanceTerm("details", finLocale)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {state === "error" && !forbidden ? (
          <button
            type="button"
            className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
            onClick={reload}
          >
            {t("retry")}
          </button>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
