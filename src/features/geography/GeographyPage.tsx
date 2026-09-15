"use client";

import { useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  DataQualityState,
  EmptyState,
  ErrorState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { DetailNavLink } from "@/components/ui/DetailNavLink";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";

type CountriesPayload = {
  items: CountryListItem[];
  label?: string;
  en?: string;
  ar?: string;
  synthetic?: boolean;
};

export function GeographyPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/geography/countries", { signal });
      if (!res.ok) throw new Error("Failed to load countries");
      return (await res.json()) as CountriesPayload;
    },
    [apiFetch],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey: "countries-list",
    fetcher,
    isEmpty: (payload) => payload.items.length === 0,
  });

  const source = data?.label
    ? {
        label: normalizeSourceLabelCode(data.label),
        code: normalizeSourceLabelCode(data.label),
        en: data.en ?? "",
        ar: data.ar ?? "",
        synthetic: data.synthetic === true,
      }
    : data
      ? resolveAdminDataSourceLabel({
          syntheticSource: data.synthetic === true,
          productionFirestore: data.synthetic === false,
        })
      : null;

  return (
    <AdminShell title={t("geography")}>
      <Breadcrumb items={[{ label: t("geography") }]} />
      <SourceLabelBadge source={source} />
      <p className="mb-4 text-sm text-slate-600">
        One country = one active agent. Invariant enforced in domain; surfaced
        here for ops.
      </p>
      {(state === "loading" || state === "idle") && !data ? (
        <SkeletonBlock />
      ) : null}
      {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
      {state === "empty" ? <EmptyState /> : null}
      {state === "success" && data ? (
        <div
          data-testid="countries-table"
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-start">{t("country")}</th>
                <th className="px-4 py-3 text-start">Active agent</th>
                <th className="px-4 py-3 text-start">Currency</th>
                <th className="px-4 py-3 text-start">Invariant</th>
                <th className="px-4 py-3 text-start">Inactive agents</th>
                <th className="px-4 py-3 text-start">Quality</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.countryId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {row.displayName ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {row.countryId}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.activeAgentId ? (
                      <DetailNavLink href={`/agents/${row.activeAgentId}`}>
                        {row.activeAgentName ?? row.activeAgentId}
                      </DetailNavLink>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{row.currencyHint ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={row.invariant}
                      testId={`country-invariant-${row.countryId}`}
                    />
                  </td>
                  <td className="px-4 py-3">{row.inactiveAgentCount}</td>
                  <td className="px-4 py-3">
                    {(row.dataQualityWarnings?.length ?? 0) > 0 ? (
                      <DataQualityState
                        message={
                          locale === "ar"
                            ? row.dataQualityWarnings
                                .map((w) => w.messageAr)
                                .join(" · ")
                            : row.dataQualityWarnings
                                .map((w) => w.messageEn)
                                .join(" · ")
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}
