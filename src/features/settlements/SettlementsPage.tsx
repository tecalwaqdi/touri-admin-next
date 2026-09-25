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
import { FinancePartyNameFilter } from "@/components/ui/FinancePartyNameFilter";
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
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { isAccountantRole } from "@/domain/ui/accountantWorkspace";
import {
  ACCOUNTANT_SETTLEMENT_LANES,
  settlementStatusForLane,
  type AccountantSettlementLaneId,
} from "@/domain/finance/reporting/AccountantSettlementLanes";
import { useSearchParams } from "next/navigation";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import {
  presentSettlementCountryPrimary,
  presentSettlementPartyPrimary,
  presentSettlementPartyTitle,
} from "@/features/settlements/settlementPartyPresentation";

export function SettlementsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const laneFromUrl = searchParams.get("lane") as AccountantSettlementLaneId | null;
  const [lane, setLane] = useState<AccountantSettlementLaneId | "">(
    laneFromUrl && ACCOUNTANT_SETTLEMENT_LANES.some((l) => l.id === laneFromUrl)
      ? laneFromUrl
      : "",
  );
  const [status, setStatus] = useState(
    (laneFromUrl && settlementStatusForLane(laneFromUrl)) || "",
  );
  const [countryId, setCountryId] = useState(searchParams.get("countryId") ?? "");
  const [driverId, setDriverId] = useState(searchParams.get("driverId") ?? "");
  const [direction, setDirection] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const isSuperAdmin = session.user?.role === "super_admin";
  const accountant = isAccountantRole(session.user?.role);

  const canCreate = useMemo(
    () =>
      isControlledWriteChromeEnabled() &&
      Boolean(
        session.user &&
          hasPermission(session.user.permissions, "settlements:create"),
      ),
    [session.user],
  );

  const effectiveStatus = useMemo(() => {
    if (lane) return settlementStatusForLane(lane) ?? status;
    return status;
  }, [lane, status]);

  const queryKey = useMemo(
    () =>
      `fr7-settlements:${effectiveStatus}:${countryId}:${direction}:${lane}:${driverId}`,
    [effectiveStatus, countryId, direction, lane, driverId],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (effectiveStatus) qs.set("settlementStatus", effectiveStatus);
      if (countryId) qs.set("countryId", countryId);
      if (direction) qs.set("settlementDirection", direction);
      if (driverId.trim()) qs.set("driverId", driverId.trim());
      qs.set("locale", finLocale);
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
    [apiFetch, effectiveStatus, countryId, direction, driverId, finLocale],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (payload) => payload.items.length === 0,
  });

  const legacyQueryKey = useMemo(
    () => `fr7-legacy-settlements:${countryId}:${isSuperAdmin ? "1" : "0"}`,
    [countryId, isSuperAdmin],
  );

  const legacyFetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!isSuperAdmin) return { items: [] as SettlementListItem[] };
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      const res = await apiFetch(`/api/finance/settlements/legacy?${qs}`, {
        signal,
      });
      if (res.status === 403) return { items: [] as SettlementListItem[] };
      if (!res.ok) return { items: [] as SettlementListItem[] };
      return (await res.json()) as { items: SettlementListItem[] };
    },
    [apiFetch, countryId, isSuperAdmin],
  );

  const legacyQuery = useStableQuery({
    queryKey: legacyQueryKey,
    fetcher: legacyFetcher,
    debounceMs: 200,
    enabled: isSuperAdmin,
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
        {accountant ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className={adminUi.sectionTitle}>{t("settlements")}</h1>
            {canCreate ? (
              <Link href="/settlements/new" className={adminUi.btnPrimary}>
                {presentFinanceTerm("prepareSettlement", finLocale)}
              </Link>
            ) : null}
          </div>
        ) : (
          <div
            data-testid="fr7-source-badge"
            className={`${adminUi.badge} bg-emerald-100 text-emerald-900`}
          >
            {t("fr7Authoritative")}
          </div>
        )}
        {!accountant &&
        (source.code === "development_synthetic" ||
          source.code === "unavailable") ? (
          <SourceLabelBadge testId="synthetic-badge" source={source} />
        ) : null}
        {accountant ? (
          <div
            data-testid="accountant-settlement-lanes"
            className="mb-4 flex flex-wrap gap-2"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-sm ${
                lane === ""
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() => {
                setLane("");
                setStatus("");
              }}
            >
              {presentFinanceTerm("all", finLocale)}
            </button>
            {ACCOUNTANT_SETTLEMENT_LANES.map((l) => (
              <button
                key={l.id}
                type="button"
                data-testid={`settlement-lane-${l.id}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  lane === l.id
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                onClick={() => {
                  setLane(l.id);
                  setStatus(settlementStatusForLane(l.id) ?? "");
                }}
              >
                {presentFinanceTerm(l.labelKey, finLocale)}
              </button>
            ))}
          </div>
        ) : null}
        <FilterBar>
          <FilterField label={presentFinanceTerm("status", finLocale)}>
            <select
              data-testid="settlement-status-filter"
              className={adminUi.filterControl}
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
          </FilterField>
          <FilterField label={presentFinanceTerm("direction", finLocale)}>
            <select
              data-testid="settlement-direction-filter"
              className={adminUi.filterControl}
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
          </FilterField>
          <FilterField label={presentFinanceTerm("country", finLocale)}>
            <FinanceCountryFilterSelect
              value={countryId}
              onChange={setCountryId}
              locale={locale}
              allLabel={t("allCountries")}
              testId="settlements-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <FinancePartyNameFilter
            partyType="driver"
            value={driverId}
            onChange={setDriverId}
            countryId={countryId || undefined}
            testId="settlements-driver-filter"
          />
          {canCreate && !accountant ? (
            <Link href="/settlements/new" className={adminUi.btnPrimary}>
              {presentFinanceTerm("new", finLocale)}
            </Link>
          ) : null}
        </FilterBar>

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
            message={
              !status && !countryId && !direction && !driverId
                ? presentFinanceTerm("emptySettlementsPeriod", finLocale)
                : presentFinanceTerm("noMatchingRecords", finLocale)
            }
          />
        ) : null}
        {state === "success" && data ? (
          <AdminDataTable
            testId="settlements-list"
            footer={undefined}
          >
            <AdminTableHead>
              <tr>
                <AdminTh>{presentFinanceTerm("settlementId", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("party", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("country", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("currency", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("direction", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("settlementAmount", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("confirmedPaid", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("outstanding", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("status", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("details", finLocale)}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.items.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd className={adminUi.monoId} title={row.id}>
                    <span className={adminUi.truncate} dir="ltr">
                      {row.id}
                    </span>
                  </AdminTd>
                  <AdminTd
                    title={presentSettlementPartyTitle({
                      partyType: row.partyType,
                      partyLabel: row.partyLabel,
                      partyIdToken: row.partyIdToken,
                    })}
                  >
                    {presentSettlementPartyPrimary({
                      partyType: row.partyType,
                      partyLabel: row.partyLabel,
                      partyIdToken: row.partyIdToken,
                      locale: finLocale,
                    })}
                  </AdminTd>
                  <AdminTd title={row.countryId}>
                    {presentSettlementCountryPrimary({
                      countryId: row.countryId,
                      countryLabel: row.countryLabel,
                      locale: finLocale,
                    })}
                  </AdminTd>
                  <AdminTd>
                    <span dir="ltr">{row.currency}</span>
                  </AdminTd>
                  <AdminTd>
                    {presentSettlementDirection(row.direction, finLocale)}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {row.amountMinor == null
                      ? presentMoneyAvailability("unknown", finLocale)
                      : formatMinorUnitsDisplay(row.amountMinor, row.currency)}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {row.paidConfirmedMinor == null
                      ? presentMoneyAvailability("unknown", finLocale)
                      : formatMinorUnitsDisplay(
                          row.paidConfirmedMinor,
                          row.currency,
                        )}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {row.outstandingMinor == null
                      ? presentMoneyAvailability("unknown", finLocale)
                      : formatMinorUnitsDisplay(
                          row.outstandingMinor,
                          row.currency,
                        )}
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge value={row.status} />
                  </AdminTd>
                  <AdminTd>
                    <Link
                      className={adminUi.link}
                      href={`/settlements/${row.id}`}
                    >
                      {presentFinanceTerm("details", finLocale)}
                    </Link>
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminDataTable>
        ) : null}

        {isSuperAdmin &&
        legacyQuery.data &&
        legacyQuery.data.items.length > 0 ? (
          <section
            data-testid="legacy-orphan-settlements"
            className="mt-8 space-y-3"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {presentFinanceTerm("legacySettlementsSection", finLocale)}
            </h2>
            <p className="text-sm text-slate-600">
              {presentFinanceTerm("legacyReadOnlyHint", finLocale)}
            </p>
            <AdminDataTable testId="legacy-settlements-list" footer={undefined}>
              <AdminTableHead>
                <tr>
                  <AdminTh>
                    {presentFinanceTerm("settlementId", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("settlementAmount", finLocale)}
                  </AdminTh>
                  <AdminTh>{presentFinanceTerm("currency", finLocale)}</AdminTh>
                  <AdminTh>{presentFinanceTerm("status", finLocale)}</AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("explanation", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("createdAt", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("sourceSnapshot", finLocale)}
                  </AdminTh>
                </tr>
              </AdminTableHead>
              <tbody>
                {legacyQuery.data.items.map((row) => (
                  <AdminTr key={row.id}>
                    <AdminTd className={adminUi.monoId} title={row.id}>
                      <span className={adminUi.truncate} dir="ltr">
                        {row.id}
                      </span>
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {row.amountMinor == null
                        ? presentMoneyAvailability("unknown", finLocale)
                        : formatMinorUnitsDisplay(
                            row.amountMinor,
                            row.currency,
                          )}
                    </AdminTd>
                    <AdminTd>
                      <span dir="ltr">{row.currency}</span>
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={row.status} />
                    </AdminTd>
                    <AdminTd>
                      {finLocale === "ar"
                        ? (row.legacyReasonAr ??
                          presentFinanceTerm("legacyOrphanReason", finLocale))
                        : (row.legacyReasonEn ??
                          presentFinanceTerm("legacyOrphanReason", finLocale))}
                    </AdminTd>
                    <AdminTd>
                      <span dir="ltr" className="text-xs text-slate-600">
                        {row.createdAtUtc ?? "—"}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <span dir="ltr" className="text-xs text-slate-600">
                        {row.sourceSnapshotId ?? "—"}
                      </span>
                    </AdminTd>
                  </AdminTr>
                ))}
              </tbody>
            </AdminDataTable>
          </section>
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
