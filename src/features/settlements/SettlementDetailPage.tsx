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
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { SettlementWriteActions } from "@/features/settlements/SettlementWriteActions";
import { SettlementPaymentWriteActions } from "@/features/settlements/SettlementPaymentWriteActions";
import {
  presentSettlementCountryPrimary,
  presentSettlementPartyPrimary,
  presentSettlementPartyTitle,
} from "@/features/settlements/settlementPartyPresentation";

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
  const [printError, setPrintError] = useState<string>();
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    setState("loading");
    setForbidden(false);
    try {
      const res = await apiFetch(
        `/api/finance/settlements/${settlementId}?locale=${encodeURIComponent(finLocale)}`,
      );
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
                  <dd
                    title={presentSettlementPartyTitle({
                      partyType: detail.partyType,
                      partyLabel: detail.partyLabel,
                      partyIdToken: detail.partyIdToken,
                    })}
                  >
                    {presentSettlementPartyPrimary({
                      partyType: detail.partyType,
                      partyLabel: detail.partyLabel,
                      partyIdToken: detail.partyIdToken,
                      locale: finLocale,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    {presentFinanceTerm("country", finLocale)}
                  </dt>
                  <dd data-testid="settlement-country" title={detail.countryId}>
                    {presentSettlementCountryPrimary({
                      countryId: detail.countryId,
                      countryLabel: detail.countryLabel,
                      locale: finLocale,
                    })}
                  </dd>
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
              <ul data-testid="settlement-payments" className="space-y-2 text-sm">
                {detail.payments.length === 0 ? (
                  <li>{presentFinanceTerm("noMatchingRecords", finLocale)}</li>
                ) : (
                  detail.payments.map((p) => (
                    <li
                      key={p.id}
                      className="rounded border border-slate-100 p-2"
                      data-testid={`settlement-payment-${p.id}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.id}</span>
                        <StatusBadge value={p.status} />
                        <span className="tabular-nums">
                          {moneyOrUnknown(p.amountMinor, p.currency)}
                        </span>
                      </div>
                      <dl className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <dt className="inline text-slate-400">
                            {finLocale === "ar" ? "الطريقة: " : "Method: "}
                          </dt>
                          <dd className="inline">{p.method ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="inline text-slate-400">
                            {finLocale === "ar" ? "المرجع: " : "Reference: "}
                          </dt>
                          <dd className="inline">{p.reference ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="inline text-slate-400">
                            {finLocale === "ar" ? "أنشئ بواسطة: " : "Created by: "}
                          </dt>
                          <dd className="inline">{p.createdBy ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="inline text-slate-400">
                            {finLocale === "ar" ? "أكد بواسطة: " : "Confirmed by: "}
                          </dt>
                          <dd className="inline">{p.confirmedBy ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="inline text-slate-400">
                            {finLocale === "ar" ? "الوقت: " : "Created: "}
                          </dt>
                          <dd className="inline">{p.createdAtUtc ?? "—"}</dd>
                        </div>
                        {p.reversalOfPaymentId ? (
                          <div>
                            <dt className="inline text-slate-400">
                              {finLocale === "ar" ? "عكس لـ: " : "Reversal of: "}
                            </dt>
                            <dd className="inline">{p.reversalOfPaymentId}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </li>
                  ))
                )}
              </ul>
              <p className="mt-2 text-xs text-slate-500" data-testid="settlement-vs-payment-state">
                {finLocale === "ar"
                  ? `حالة التسوية: ${presentStatus(detail.status, finLocale)}`
                  : `Settlement state: ${presentStatus(detail.status, finLocale)}`}
              </p>
              <div className="mt-3">
                <a
                  className="text-sm text-indigo-700 underline"
                  href={`/api/reports/print/settlement/${encodeURIComponent(detail.id)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setPrintError(undefined);
                    const w = window.open("", "_blank");
                    if (!w) {
                      setPrintError(finLocale === "ar" ? "يرجى السماح بفتح نافذة الطباعة" : "Please allow the print window to open");
                      return;
                    }
                    w.opener = null;
                    void (async () => {
                      try {
                        const res = await apiFetch(`/api/reports/print/settlement/${encodeURIComponent(detail.id)}`, {
                          method: "POST", headers: { "content-type": "application/json" },
                          body: JSON.stringify({ locale: finLocale }),
                        });
                        if (!res.ok) throw new Error("PRINT_UNAVAILABLE");
                        const html = await res.text();
                        if (!w.closed) { w.document.write(html); w.document.close(); }
                      } catch {
                        w.close();
                        setPrintError(presentFinanceTerm("dataUnavailable", finLocale));
                      }
                    })();
                  }}
                >
                  {finLocale === "ar" ? "طباعة الإيصال (A4)" : "Print receipt (A4)"}
                </a>
                {printError ? <p role="alert" className="mt-2 text-sm text-red-700">{printError}</p> : null}
              </div>
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
            {detail.readOnly || detail.commercialClass === "legacy_orphan" ? (
              <p
                data-testid="legacy-settlement-read-only"
                className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              >
                {presentFinanceTerm("legacyReadOnlyHint", finLocale)}
                {" — "}
                {finLocale === "ar"
                  ? (detail.legacyReasonAr ??
                    presentFinanceTerm("legacyOrphanReason", finLocale))
                  : (detail.legacyReasonEn ??
                    presentFinanceTerm("legacyOrphanReason", finLocale))}
              </p>
            ) : (
              <>
                <SettlementWriteActions
                  settlementId={detail.id}
                  currentStatus={detail.status}
                  onDone={() => void load()}
                />
                <SettlementPaymentWriteActions
                  settlementId={detail.id}
                  payments={detail.payments.map((p) => ({
                    id: p.id,
                    status: p.status,
                    amountMinor: p.amountMinor,
                  }))}
                  onDone={() => void load()}
                />
              </>
            )}
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
