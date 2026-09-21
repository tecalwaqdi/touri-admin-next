"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";

type GeographyResource = "country" | "region" | "city" | "landmark";

type Option = { id: string; label: string };

function RequiredMark() {
  const { t } = useI18n();
  return (
    <span className="text-rose-600" title={t("requiredMark")}>
      {" "}
      *
    </span>
  );
}

/**
 * Gated geography create chrome — Production flags remain authoritative.
 * CREATE fields mirror EDIT allowlist for legitimate Legacy-backed metadata.
 */
export function GeographyCreatePanel({
  resource,
  onCreated,
}: {
  resource: GeographyResource;
  onCreated?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [displayNameEn, setDisplayNameEn] = useState("");
  const [displayNameAr, setDisplayNameAr] = useState("");
  const [isoCode, setIsoCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [category, setCategory] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [countries, setCountries] = useState<Option[]>([]);
  const [regions, setRegions] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:manage") ||
          hasPermission(session.user.permissions, "users:manage")
        : false,
    [session.user],
  );

  const loadCountries = useCallback(async () => {
    const res = await apiFetch("/api/geography/countries?limit=50");
    if (!res.ok) return;
    const json = (await res.json()) as {
      items?: Array<{
        countryId: string;
        displayName?: string | null;
        displayNameEn?: string | null;
        displayNameAr?: string | null;
      }>;
    };
    setCountries(
      (json.items ?? []).map((c) => ({
        id: c.countryId,
        label:
          (locale === "ar"
            ? c.displayNameAr ?? c.displayName
            : c.displayNameEn ?? c.displayName) || c.countryId,
      })),
    );
  }, [apiFetch, locale]);

  const loadRegions = useCallback(
    async (cid: string) => {
      if (!cid) {
        setRegions([]);
        return;
      }
      const qs = new URLSearchParams({ limit: "50", countryId: cid });
      const res = await apiFetch(`/api/geography/regions?${qs}`);
      if (!res.ok) {
        setRegions([]);
        return;
      }
      const json = (await res.json()) as {
        items?: Array<{
          regionId: string;
          displayName?: string | null;
          displayNameEn?: string | null;
          displayNameAr?: string | null;
        }>;
      };
      setRegions(
        (json.items ?? []).map((r) => ({
          id: r.regionId,
          label:
            (locale === "ar"
              ? r.displayNameAr ?? r.displayName
              : r.displayNameEn ?? r.displayName) || r.regionId,
        })),
      );
    },
    [apiFetch, locale],
  );

  const loadCities = useCallback(
    async (cid: string) => {
      if (!cid) {
        setCities([]);
        return;
      }
      const qs = new URLSearchParams({ limit: "50", countryId: cid });
      const res = await apiFetch(`/api/geography/cities?${qs}`);
      if (!res.ok) {
        setCities([]);
        return;
      }
      const json = (await res.json()) as {
        items?: Array<{
          cityId: string;
          displayName?: string | null;
          displayNameEn?: string | null;
          displayNameAr?: string | null;
        }>;
      };
      setCities(
        (json.items ?? []).map((c) => ({
          id: c.cityId,
          label:
            (locale === "ar"
              ? c.displayNameAr ?? c.displayName
              : c.displayNameEn ?? c.displayName) || c.cityId,
        })),
      );
    },
    [apiFetch, locale],
  );

  useEffect(() => {
    if (!open || !canWrite) return;
    if (resource !== "country") void loadCountries();
  }, [open, canWrite, resource, loadCountries]);

  useEffect(() => {
    if (!open || !countryId) return;
    if (resource === "city" || resource === "landmark" || resource === "region") {
      void loadRegions(countryId);
    }
    if (resource === "landmark") void loadCities(countryId);
  }, [open, countryId, resource, loadRegions, loadCities]);

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const run = async () => {
    if (inFlight.current) return;
    const id = resourceId.trim();
    if (!id || !displayNameEn.trim() || !displayNameAr.trim()) {
      setError(t("error"));
      return;
    }
    if (resource !== "country" && !countryId.trim()) {
      setError(t("error"));
      return;
    }
    if (resource === "landmark" && !cityId.trim()) {
      setError(t("error"));
      return;
    }
    const latN = lat.trim() ? Number(lat) : undefined;
    const lngN = lng.trim() ? Number(lng) : undefined;
    if (
      (lat.trim() || lng.trim()) &&
      (latN == null ||
        lngN == null ||
        !Number.isFinite(latN) ||
        !Number.isFinite(lngN))
    ) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(
        `/api/geography/${resource}/${encodeURIComponent(id)}/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": `geo-create-${resource}-${id}-${Date.now()}`,
          },
          body: JSON.stringify({
            expectedActive: null,
            preconditionToken: "create",
            reasonCode: "operational",
            metadata: {
              displayNameEn: displayNameEn.trim(),
              displayNameAr: displayNameAr.trim(),
              ...(resource === "country" && isoCode.trim()
                ? { isoCode: isoCode.trim() }
                : {}),
              ...(resource === "country" && currencyCode.trim()
                ? { currencyCode: currencyCode.trim() }
                : {}),
              ...(countryId.trim() ? { countryId: countryId.trim() } : {}),
              ...(regionId.trim() ? { regionId: regionId.trim() } : {}),
              ...(cityId.trim() ? { cityId: cityId.trim() } : {}),
              ...(category.trim() ? { category: category.trim() } : {}),
              ...(latN != null && lngN != null ? { lat: latN, lng: lngN } : {}),
            },
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        setError(json.message ?? json.error ?? json.code ?? t("error"));
        return;
      }
      setSuccess(t("writeApplied"));
      setConfirming(false);
      setOpen(false);
      onCreated?.(id);
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div data-testid={`geography-create-${resource}`} className="mb-3">
      {!open ? (
        <button
          type="button"
          className={adminUi.btnPrimary}
          data-testid={`geography-create-open-${resource}`}
          onClick={() => setOpen(true)}
        >
          {t("geographyCreateAction")}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("id")}
                <RequiredMark />
              </span>
              <input
                className={adminUi.filterControl}
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("name")} (EN)
                <RequiredMark />
              </span>
              <input
                className={adminUi.filterControl}
                value={displayNameEn}
                onChange={(e) => setDisplayNameEn(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("name")} (AR)
                <RequiredMark />
              </span>
              <input
                className={adminUi.filterControl}
                value={displayNameAr}
                onChange={(e) => setDisplayNameAr(e.target.value)}
                dir="rtl"
                required
              />
            </label>
            {resource === "country" ? (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("isoCode")}</span>
                  <input
                    className={adminUi.filterControl}
                    value={isoCode}
                    maxLength={2}
                    onChange={(e) => setIsoCode(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("currency")}</span>
                  <input
                    className={adminUi.filterControl}
                    value={currencyCode}
                    maxLength={3}
                    onChange={(e) =>
                      setCurrencyCode(e.target.value.toUpperCase())
                    }
                  />
                </label>
              </>
            ) : null}
            {resource !== "country" ? (
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">
                  {t("country")}
                  <RequiredMark />
                </span>
                <select
                  className={adminUi.filterControl}
                  aria-label={t("country")}
                  value={countryId}
                  onChange={(e) => {
                    setCountryId(e.target.value);
                    setRegionId("");
                    setCityId("");
                  }}
                  required
                >
                  <option value="">{t("selectCountry")}</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {countryId ? (
                  <span className="mt-0.5 block font-mono text-xs text-slate-400">
                    {countryId}
                  </span>
                ) : null}
              </label>
            ) : null}
            {resource === "city" || resource === "landmark" || resource === "region" ? (
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">{t("region")}</span>
                <select
                  data-testid="geography-create-region-id"
                  className={adminUi.filterControl}
                  aria-label={t("region")}
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                  disabled={!countryId}
                >
                  <option value="">{t("selectRegion")}</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {resource === "landmark" ? (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">
                    {t("city")}
                    <RequiredMark />
                  </span>
                  <select
                    className={adminUi.filterControl}
                    aria-label={t("city")}
                    value={cityId}
                    onChange={(e) => setCityId(e.target.value)}
                    disabled={!countryId}
                    required
                  >
                    <option value="">{t("selectCity")}</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("category")}</span>
                  <input
                    className={adminUi.filterControl}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("latitude")}</span>
                  <input
                    className={adminUi.filterControl}
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("longitude")}</span>
                  <input
                    className={adminUi.filterControl}
                    inputMode="decimal"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={adminUi.btnPrimary}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              {t("geographyCreateAction")}
            </button>
            <button
              type="button"
              className={adminUi.btnGhost}
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </button>
          </div>
          {confirming ? (
            <ControlledWriteConfirmPanel
              testIdPrefix={`geography-create-${resource}`}
              confirmTemplateKey="confirmGeographyWrite"
              actionLabelKey="geographyCreateAction"
              targetId={resourceId.trim() || "—"}
              stateLabel={t("unknown")}
              pending={pending}
              onConfirm={() => void run()}
              onCancel={() => setConfirming(false)}
            />
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mt-2 text-sm text-emerald-700" role="status">
              {success}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
