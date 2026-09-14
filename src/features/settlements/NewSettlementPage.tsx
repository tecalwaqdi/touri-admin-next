"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { ErrorState, LoadingState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import type { FinancialTrip } from "@/domain/finance/FinancialTrip";
import type { EligibilityExclusion } from "@/domain/finance/SettlementEligibilityService";

export function NewSettlementPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const router = useRouter();
  const [partyType, setPartyType] = useState<"agent" | "driver">("agent");
  const [partyId, setPartyId] = useState("AGT-SA-001");
  const [countryId, setCountryId] = useState("SA");
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [periodFromUtc, setPeriodFromUtc] = useState("2026-08-01T00:00:00.000Z");
  const [periodToUtc, setPeriodToUtc] = useState("2026-08-31T23:59:59.000Z");
  const [eligible, setEligible] = useState<FinancialTrip[]>([]);
  const [excluded, setExcluded] = useState<EligibilityExclusion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const preview = async () => {
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
      if (!res.ok) throw new Error("Eligibility preview failed");
      const json = (await res.json()) as {
        eligible: FinancialTrip[];
        excluded: EligibilityExclusion[];
      };
      setEligible(json.eligible);
      setExcluded(json.excluded);
      setSelected(json.eligible.map((e) => e.tripId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void preview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
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
        throw new Error(body.error ?? "Create failed");
      }
      const settlement = (await res.json()) as { id: string };
      router.push(`/settlements/${settlement.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setLoading(false);
    }
  };

  return (
    <AdminShell title={t("settlements")}>
      <PermissionGuard permission="settlements:create">
        <Breadcrumb
          items={[
            { href: "/settlements", label: t("settlements") },
            { label: "New" },
          ]}
        />
        <div
          data-testid="synthetic-badge"
          className="mb-4 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
        >
          {t("syntheticData")} / بيانات تجريبية
        </div>
        <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <label className="text-sm">
            Party type
            <select
              className="mt-1 block w-full rounded border px-2 py-1"
              value={partyType}
              onChange={(e) => setPartyType(e.target.value as "agent" | "driver")}
            >
              <option value="agent">agent</option>
              <option value="driver">driver</option>
            </select>
          </label>
          <label className="text-sm">
            Party ID
            <input
              className="mt-1 block w-full rounded border px-2 py-1"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Country
            <input
              className="mt-1 block w-full rounded border px-2 py-1"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Currency
            <input
              className="mt-1 block w-full rounded border px-2 py-1"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Period from
            <input
              className="mt-1 block w-full rounded border px-2 py-1"
              value={periodFromUtc}
              onChange={(e) => setPeriodFromUtc(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Period to
            <input
              className="mt-1 block w-full rounded border px-2 py-1"
              value={periodToUtc}
              onChange={(e) => setPeriodToUtc(e.target.value)}
            />
          </label>
        </div>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            data-testid="preview-eligibility"
            className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
            onClick={() => void preview()}
          >
            Preview eligibility
          </button>
          <button
            type="button"
            data-testid="create-settlement"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => void create()}
            disabled={loading}
          >
            Create draft
          </button>
        </div>
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <div data-testid="eligible-trips" className="rounded-lg border bg-white p-4">
            <h2 className="mb-2 font-semibold">Eligible trips ({eligible.length})</h2>
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
                    {ft.tripId} — {ft.confidence}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div data-testid="excluded-trips" className="rounded-lg border bg-white p-4">
            <h2 className="mb-2 font-semibold">Excluded trips ({excluded.length})</h2>
            <ul className="max-h-80 space-y-2 overflow-auto text-sm">
              {excluded.map((ex) => (
                <li key={`${ex.tripId}-${ex.reasonCode}`}>
                  <div className="font-medium">{ex.tripId}</div>
                  <div>
                    {ex.reasonCode}: {ex.reasonLabel}
                  </div>
                  <div className="text-slate-500">{ex.details}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          data-testid="synthetic-financial-badge"
          className="mt-4 inline-flex rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900"
        >
          Synthetic financial calculation
        </div>
      </PermissionGuard>
    </AdminShell>
  );
}
