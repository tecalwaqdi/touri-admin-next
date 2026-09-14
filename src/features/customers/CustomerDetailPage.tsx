"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { ErrorState, LoadingState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import type { Customer, QueryState } from "@/types/common";
import { CustomerWriteActions } from "@/features/customers/CustomerWriteActions";
import { customerStatusToOperational } from "@/application/controlled-writes/runtime/CustomerAdminWriteBridge";

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<QueryState>("idle");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const load = async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/customers/${customerId}`);
        if (!res.ok) throw new Error("Customer not found");
        setCustomer((await res.json()) as Customer);
        setState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"));
        setState("error");
      }
    };
    void load();
  }, [customerId, t]);

  return (
    <AdminShell title={t("customers")}>
      <PermissionGuard permission="customers:read">
        <Breadcrumb
          items={[
            { href: "/customers", label: t("customers") },
            { label: customerId },
          ]}
        />
        <div
          data-testid="synthetic-badge"
          className="mb-4 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
        >
          {t("syntheticData")} / بيانات تجريبية
        </div>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} /> : null}
        {state === "success" && customer ? (
          <div data-testid="customer-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-slate-500">Name</dt>
                  <dd>{customer.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("country")}</dt>
                  <dd data-testid="customer-country">
                    {customer.countryId} / {customer.cityId}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("status")}</dt>
                  <dd data-testid="customer-status">{customer.status}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Operational state</dt>
                  <dd data-testid="customer-operational-state">
                    {customerStatusToOperational(customer.status)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("tripsCount")}</dt>
                  <dd>{customer.tripCount}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Completed / cancelled</dt>
                  <dd>
                    {customer.completedTrips} / {customer.cancelledTrips}
                  </dd>
                </div>
              </dl>
            </div>
            <CustomerWriteActions
              customer={customer}
              onUpdated={(next) => setCustomer(next)}
            />
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
