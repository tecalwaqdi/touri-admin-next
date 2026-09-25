"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { adminUi } from "@/components/ui/adminUi";
import type { FinancePartyDirectoryItem } from "@/application/finance/reporting/FinancePartyDirectory";

type Props = {
  partyType: "driver" | "agent";
  value: string;
  onChange: (partyId: string) => void;
  countryId?: string;
  testId?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Searchable driver/agent name filter for accountant finance surfaces.
 * Stores party id internally; never requires typing Firebase IDs.
 */
export function FinancePartyNameFilter({
  partyType,
  value,
  onChange,
  countryId,
  testId,
  disabled,
  className,
}: Props) {
  const { locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<FinancePartyDirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");

  const allLabel =
    partyType === "driver"
      ? presentFinanceTerm("allDrivers", finLocale)
      : presentFinanceTerm("allAgents", finLocale);
  const nameLabel =
    partyType === "driver"
      ? presentFinanceTerm("driverName", finLocale)
      : presentFinanceTerm("agentName", finLocale);

  const load = useCallback(
    async (q: string, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          partyType,
          locale: finLocale,
          limit: "30",
        });
        if (q.trim()) qs.set("q", q.trim());
        if (countryId) qs.set("countryId", countryId);
        const res = await apiFetch(`/api/finance/parties?${qs}`, { signal });
        if (!res.ok) {
          setItems([]);
          return;
        }
        const body = (await res.json()) as { items: FinancePartyDirectoryItem[] };
        setItems(body.items ?? []);
      } catch {
        if (!signal?.aborted) setItems([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiFetch, countryId, finLocale, partyType],
  );

  useEffect(() => {
    if (disabled) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      void load(query, ctrl.signal);
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [disabled, load, query]);

  useEffect(() => {
    if (!value) {
      setSelectedLabel("");
      return;
    }
    const hit = items.find((i) => i.id === value);
    if (hit) setSelectedLabel(hit.displayName);
  }, [items, value]);

  const options = useMemo(() => {
    const rows = [...items];
    if (value && !rows.some((r) => r.id === value) && selectedLabel) {
      rows.unshift({
        id: value,
        partyType,
        displayName: selectedLabel,
        countryId: countryId ?? null,
        countryLabel: null,
        cityLabel: null,
      });
    }
    return rows;
  }, [countryId, items, partyType, selectedLabel, value]);

  return (
    <div className={className}>
      <label className="block text-sm text-slate-700">
        {nameLabel}
        <input
          list={listId}
          data-testid={testId}
          className={`${adminUi.filterControl} mt-1 w-full min-w-[12rem]`}
          value={value ? selectedLabel || query : query}
          disabled={disabled}
          placeholder={allLabel}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setSelectedLabel("");
            if (!next.trim()) {
              onChange("");
              return;
            }
            const match = options.find(
              (o) =>
                o.displayName === next ||
                o.id === next ||
                `${o.displayName} · ${o.countryLabel ?? ""}`.trim() === next,
            );
            if (match) {
              onChange(match.id);
              setSelectedLabel(match.displayName);
            } else if (value) {
              onChange("");
            }
          }}
          onFocus={() => {
            if (!query && !value) void load("");
          }}
        />
        <datalist id={listId}>
          <option value="">{allLabel}</option>
          {options.map((o) => (
            <option
              key={o.id}
              value={
                o.countryLabel
                  ? `${o.displayName} · ${o.countryLabel}`
                  : o.displayName
              }
            />
          ))}
        </datalist>
      </label>
      {value ? (
        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400" title={value}>
          {presentFinanceTerm("technicalIds", finLocale)}: {value.slice(0, 10)}
          {value.length > 10 ? "…" : ""}
        </p>
      ) : loading ? (
        <p className="mt-0.5 text-[10px] text-slate-400">…</p>
      ) : null}
    </div>
  );
}
