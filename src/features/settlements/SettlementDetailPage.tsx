"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  ForbiddenState,
  LoadingState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import type { SettlementDetailReadModel } from "@/domain/finance/reporting/FinanceReportingTypes";
import type { QueryState } from "@/types/common";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";
import {
  presentCorrectionKind,
  presentFinanceTerm,
  presentMoneyAvailability,
  presentSettlementDirection,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";

/**
 * Settlement DETAIL — FR7 SettlementDetailReadModel (same authoritative values as list).
 * No React money calculation. Write path remains SettlementCommandService (separate).
 * PC-5: presentation only — no mutation buttons.
 */
export function SettlementDetailPage({ settlementId }: { settlementId: string }) {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [state, setState] = useState<QueryState>("idle");
  const [detail, setDetail] = useState<SettlementDetailReadModel | null>(null);
  const [error, setError] = useState<string>();
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    setState("loading");
    setForbidden(false);
    try {
      const res = await apiFetch(`/api/finance/settlements/${settlementId}`);
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (res.status === 404) {
        throw new Error(
          t("recordNotFound"),
        );
      }
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
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

  const moneyOrUnknown = (amountMinor: string | null, currency: string) =>
    amountMinor == null
      ? presentMoneyAvailability("unknown", finLocale)
      : formatMinorUnitsDisplay(amountMinor, currency);

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
          {t("fr7Authoritative")}
        </div>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {forbidden ? (
          <ForbiddenState
            message={presentFinanceTerm("financeForbidden", finLocale)}
          />
        ) : null}
        {state === "error" && !forbidden ? (
          <UnavailableState message={error} />
        ) : null}
        {state === "success" && detail ? (
          <div
            data-testid="settlement-detail"
            dir={locale === "ar" ? "rtl" : "ltr"}
            className="space-y-4"
          >
            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 font-semibold">
                {presentFinanceTerm("overview", finLocale)}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("settlementId", finLocale)}
                  </dt>
                  <dd data-testid="settlement-id">{detail.id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("status", finLocale)}
                  </dt>
                  <dd data-testid="settlement-status">
                    <StatusBadge value={detail.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("direction", finLocale)}
                  </dt>
                  <dd data-testid="settlement-direction">
                    {presentSettlementDirection(detail.direction, finLocale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("period", finLocale)}
                  </dt>
                  <dd>
                    {detail.periodFromUtc ?? "—"} → {detail.periodToUtc ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("currency", finLocale)}
                  </dt>
                  <dd>{detail.currency}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 font-semibold">
                {presentFinanceTerm("partyScope", finLocale)}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("party", finLocale)}
                  </dt>
                  <dd>
                    {detail.partyType}:{detail.partyIdToken}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("country", finLocale)}
                  </dt>
                  <dd data-testid="settlement-country">{detail.countryId}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 font-semibold">
                {presentFinanceTerm("amounts", finLocale)}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("settlementAmount", finLocale)}
                  </dt>
                  <dd data-testid="settlement-amount" className="tabular-nums">
                    {moneyOrUnknown(detail.amountMinor, detail.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("paidConfirmed", finLocale)}
                  </dt>
                  <dd data-testid="settlement-paid" className="tabular-nums">
                    {moneyOrUnknown(detail.paidConfirmedMinor, detail.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("outstanding", finLocale)}
                  </dt>
                  <dd
                    data-testid="settlement-outstanding"
                    className="tabular-nums"
                  >
                    {moneyOrUnknown(detail.outstandingMinor, detail.currency)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 font-semibold">
                {presentFinanceTerm("paymentProgress", finLocale)}
              </h2>
              <ul data-testid="settlement-payments" className="space-y-1 text-sm">
                {detail.payments.length === 0 ? (
                  <li>{presentFinanceTerm("noMatchingRecords", finLocale)}</li>
                ) : (
                  detail.payments.map((p) => (
                    <li key={p.id}>
                      {p.id}: <StatusBadge value={p.status} /> —{" "}
                      {moneyOrUnknown(p.amountMinor, p.currency)}
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 font-semibold">
                {presentFinanceTerm("sourceLinkage", finLocale)}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("sourceSnapshot", finLocale)}
                  </dt>
                  <dd>{detail.sourceSnapshotId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("claims", finLocale)}
                  </dt>
                  <dd>
                    <ul data-testid="settlement-claims" className="space-y-1 text-sm">
                      {detail.claims.map((c) => (
                        <li key={c.lineId}>
                          {c.lineId} / {c.orderIdToken}:{" "}
                          {moneyOrUnknown(c.amountMinor, c.currency)}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 font-semibold">
                {presentFinanceTerm("relatedCorrections", finLocale)}
              </h2>
              <ul
                data-testid="settlement-adjustments"
                className="space-y-1 text-sm"
              >
                {detail.approvedAdjustments.length === 0 ? (
                  <li>{presentFinanceTerm("noMatchingRecords", finLocale)}</li>
                ) : (
                  detail.approvedAdjustments.map((a) => (
                    <li key={a.id} data-monetary={a.monetaryEffect ? "yes" : "no"}>
                      {a.id}:{" "}
                      {presentCorrectionKind("adjustment", finLocale, {
                        directionOrKind: a.direction,
                        monetaryEffect: a.monetaryEffect,
                      })}{" "}
                      —{" "}
                      {a.monetaryEffect
                        ? presentFinanceTerm("monetaryYes", finLocale)
                        : presentFinanceTerm("neutralMemo", finLocale)}{" "}
                      —{" "}
                      {a.signedCompanyClaimImpactMinor == null
                        ? "—"
                        : formatMinorUnitsDisplay(
                            a.signedCompanyClaimImpactMinor,
                            detail.currency,
                          )}
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
