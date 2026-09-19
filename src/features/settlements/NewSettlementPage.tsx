"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  DeferredSurfaceState,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/states/QueryStates";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import type { FinancialTrip } from "@/domain/finance/FinancialTrip";
import type { EligibilityExclusion } from "@/domain/finance/SettlementEligibilityService";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { isSyntheticSettlementFixtureId } from "@/domain/catalog/QaTestRecordFilter";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { adminUi } from "@/components/ui/adminUi";

type PartyOption = {
  id: string;
  label: string;
  countryId?: string | null;
};

function fromDateInputValue(date: string, endOfDay: boolean): string {
  if (!date) return "";
  return endOfDay
    ? `${date}T23:59:59.000Z`
    : `${date}T00:00:00.000Z`;
}

/**
 * PC-8: mutation UI gated. Operational create settlement — Arabic + real pickers.
 */
export function NewSettlementPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const router = useRouter();
  const [partyType, setPartyType] = useState<"agent" | "driver">("agent");
  const [partyId, setPartyId] = useState("");
  const [countryId, setCountryId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [periodFromDate, setPeriodFromDate] = useState("");
  const [periodToDate, setPeriodToDate] = useState("");
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [partiesLoading, setPartiesLoading] = useState(false);
  const [eligible, setEligible] = useState<FinancialTrip[]>([]);
  const [excluded, setExcluded] = useState<EligibilityExclusion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [hideQa, setHideQa] = useState(true);

  const writesUi = isControlledWriteChromeEnabled();

  const periodFromUtc = useMemo(
    () => fromDateInputValue(periodFromDate, false),
    [periodFromDate],
  );
  const periodToUtc = useMemo(
    () => fromDateInputValue(periodToDate, true),
    [periodToDate],
  );

  const loadParties = useCallback(async () => {
    setPartiesLoading(true);
    try {
      const qs = new URLSearchParams({ pageSize: "50", limit: "50" });
      if (countryId) qs.set("countryId", countryId);
      const path =
        partyType === "agent"
          ? `/api/agents?${qs}`
          : `/api/drivers?${qs}`;
      const res = await apiFetch(path);
      if (!res.ok) {
        setPartyOptions([]);
        return;
      }
      const json = (await res.json()) as {
        items?: Array<{
          id?: string;
          agentId?: string;
          driverId?: string;
          displayName?: string | null;
          name?: string | null;
          countryId?: string | null;
        }>;
      };
      const options: PartyOption[] = [];
      for (const row of json.items ?? []) {
        const id = (row.id ?? row.agentId ?? row.driverId ?? "").trim();
        if (!id) continue;
        if (hideQa && isSyntheticSettlementFixtureId(id)) continue;
        options.push({
          id,
          label: row.displayName ?? row.name ?? id,
          countryId: row.countryId ?? null,
        });
      }
      setPartyOptions(options);
      if (partyId && !options.some((o) => o.id === partyId)) {
        setPartyId("");
      }
    } catch {
      setPartyOptions([]);
    } finally {
      setPartiesLoading(false);
    }
  }, [apiFetch, countryId, hideQa, partyId, partyType]);

  useEffect(() => {
    if (!writesUi) return;
    void loadParties();
  }, [writesUi, loadParties]);

  const preview = async () => {
    if (!partyId || !countryId || !periodFromUtc || !periodToUtc) {
      setError(t("settlementFormIncomplete"));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const qs = new URLSearchParams({
        partyType,
        partyId,
        currencyCode,
        periodFromUtc,
        periodToUtc,
        countryId,
      });
      const res = await apiFetch(`/api/settlements/eligibility?${qs}`);
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as {
        eligible: FinancialTrip[];
        excluded: EligibilityExclusion[];
      };
      const eligibleRows = hideQa
        ? json.eligible.filter((e) => !isSyntheticSettlementFixtureId(e.tripId))
        : json.eligible;
      const excludedRows = hideQa
        ? json.excluded.filter((e) => !isSyntheticSettlementFixtureId(e.tripId))
        : json.excluded;
      setEligible(eligibleRows);
      setExcluded(excludedRows);
      setSelected(eligibleRows.map((e) => e.tripId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!partyId || !countryId || !periodFromUtc || !periodToUtc) {
      setError(t("settlementFormIncomplete"));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const res = await apiFetch("/api/settlements", {
        method: "POST",
        body: JSON.stringify({
          partyType,
          partyId,
          currencyCode,
          periodFromUtc,
          periodToUtc,
          countryId,
          tripIds: selected,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? t("requestFailed"));
      }
      const settlement = (await res.json()) as { id: string };
      router.push(`/settlements/${settlement.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setLoading(false);
    }
  };

  if (!writesUi) {
    return (
      <AdminShell title={t("settlements")}>
        <PermissionGuard permission="settlements:create">
          <Breadcrumb
            items={[
              { href: "/settlements", label: t("settlements") },
              { label: t("surfaceDeferred") },
            ]}
          />
          <DeferredSurfaceState message={t("readOnlyNotice")} />
        </PermissionGuard>
      </AdminShell>
    );
  }

  return (
    <AdminShell title={t("settlements")}>
      <PermissionGuard permission="settlements:create">
        <Breadcrumb
          items={[
            { href: "/settlements", label: t("settlements") },
            { label: t("createSettlement") },
          ]}
        />
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded border px-2 py-1 text-sm">
            <input
              data-testid="settlement-hide-qa"
              type="checkbox"
              checked={hideQa}
              onChange={(e) => setHideQa(e.target.checked)}
            />
            {t("hideTestQaRecords")}
          </label>
        </div>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <label className="text-sm">
            {t("partyType")}
            <select
              data-testid="settlement-party-type"
              className="mt-1 block w-full rounded border px-2 py-1"
              value={partyType}
              onChange={(e) => {
                setPartyType(e.target.value as "agent" | "driver");
                setPartyId("");
              }}
            >
              <option value="agent">{t("partyTypeAgent")}</option>
              <option value="driver">{t("partyTypeDriver")}</option>
            </select>
          </label>
          <label className="text-sm">
            {t("country")}
            <div className="mt-1">
              <FinanceCountryFilterSelect
                value={countryId}
                onChange={(v) => {
                  setCountryId(v);
                  setPartyId("");
                }}
                locale={locale}
                allowEmpty
                allLabel={t("allCountries")}
                testId="settlement-country"
                className="block w-full rounded border px-2 py-1"
              />
            </div>
          </label>
          <label className="text-sm">
            {partyType === "agent" ? t("selectAgent") : t("selectDriver")}
            <select
              data-testid="settlement-party-picker"
              className="mt-1 block w-full rounded border px-2 py-1"
              value={partyId}
              disabled={partiesLoading || !countryId}
              onChange={(e) => setPartyId(e.target.value)}
            >
              <option value="">
                {partiesLoading
                  ? t("loading")
                  : !countryId
                    ? t("selectCountryFirst")
                    : t("selectParty")}
              </option>
              {partyOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t("currency")}
            <select
              data-testid="settlement-currency"
              className="mt-1 block w-full rounded border px-2 py-1"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            >
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
              <option value="EGP">EGP</option>
              <option value="KWD">KWD</option>
              <option value="JOD">JOD</option>
              <option value="KGS">KGS</option>
            </select>
          </label>
          <label className="text-sm">
            {t("periodFrom")}
            <input
              data-testid="settlement-period-from"
              type="date"
              className="mt-1 block w-full rounded border px-2 py-1"
              value={periodFromDate}
              onChange={(e) => setPeriodFromDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            {t("periodTo")}
            <input
              data-testid="settlement-period-to"
              type="date"
              className="mt-1 block w-full rounded border px-2 py-1"
              value={periodToDate}
              onChange={(e) => setPeriodToDate(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="preview-eligibility"
            className={adminUi.btnPrimary}
            onClick={() => void preview()}
          >
            {t("previewEligibility")}
          </button>
          <button
            type="button"
            data-testid="create-settlement"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => void create()}
            disabled={loading || selected.length === 0}
          >
            {t("createDraft")}
          </button>
        </div>
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div data-testid="eligible-trips" className="rounded-lg border bg-white p-4">
            <h2 className="mb-2 font-semibold">
              {t("eligibleTrips")} ({eligible.length})
            </h2>
            {eligible.length === 0 ? (
              <EmptyState message={t("noEligibleTrips")} />
            ) : (
              <ul className="max-h-80 space-y-1 overflow-auto text-sm">
                {eligible.map((ft) => (
                  <li key={ft.tripId}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(ft.tripId)}
                        onChange={(e) => {
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, ft.tripId]
                              : prev.filter((id) => id !== ft.tripId),
                          );
                        }}
                      />
                      {ft.tripId}
                      {ft.confidence
                        ? ` — ${presentStatus(ft.confidence, locale === "ar" ? "ar" : "en")}`
                        : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div data-testid="excluded-trips" className="rounded-lg border bg-white p-4">
            <h2 className="mb-2 font-semibold">
              {t("excludedTrips")} ({excluded.length})
            </h2>
            {excluded.length === 0 ? (
              <EmptyState message={t("noExcludedTrips")} />
            ) : (
              <ul className="max-h-80 space-y-2 overflow-auto text-sm">
                {excluded.map((ex) => (
                  <li key={`${ex.tripId}-${ex.reasonCode}`}>
                    <div className="font-medium">{ex.tripId}</div>
                    <div>
                      {ex.reasonCode}: {ex.reasonLabel}
                    </div>
                    {ex.details ? (
                      <div className="text-slate-500">{ex.details}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PermissionGuard>
    </AdminShell>
  );
}
