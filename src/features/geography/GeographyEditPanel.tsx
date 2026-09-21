"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { LocationMapPicker } from "@/components/ui/LocationMapPicker";
import { adminUi } from "@/components/ui/adminUi";

type GeographyResource = "country" | "region" | "city" | "landmark";

type Option = { id: string; label: string; regionId?: string };

function RequiredMark() {
  const { t } = useI18n();
  return (
    <span className="text-rose-600" title={t("requiredMark")}>
      {" "}
      *
    </span>
  );
}

function isValidCoord(lat: number | null, lng: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
  );
}

/**
 * Gated geography metadata edit — Domain update_metadata only.
 * CREATE/EDIT parity for allowlisted Legacy-backed fields.
 * Omitted fields are not sent (preserve historical / images).
 */
export function GeographyEditPanel({
  resource,
  resourceId,
  displayNameEn,
  displayNameAr,
  active,
  preconditionToken,
  isoCode,
  currencyCode,
  countryId: initialCountryId,
  regionId: initialRegionId,
  cityId: initialCityId,
  category: initialCategory,
  descriptionEn: initialDescriptionEn,
  descriptionAr: initialDescriptionAr,
  address: initialAddress,
  isMosque: initialIsMosque,
  isFood: initialIsFood,
  isRestroom: initialIsRestroom,
  asAds: initialAsAds,
  rate: initialRate,
  lat: initialLat,
  lng: initialLng,
  onUpdated,
}: {
  resource: GeographyResource;
  resourceId: string;
  displayNameEn: string | null;
  displayNameAr: string | null;
  active: boolean | null;
  preconditionToken: string;
  isoCode?: string | null;
  currencyCode?: string | null;
  countryId?: string | null;
  regionId?: string | null;
  cityId?: string | null;
  category?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  address?: string | null;
  isMosque?: boolean | null;
  isFood?: boolean | null;
  isRestroom?: boolean | null;
  asAds?: boolean | null;
  rate?: number | null;
  lat?: number | null;
  lng?: number | null;
  onUpdated?: () => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState(displayNameEn ?? "");
  const [nameAr, setNameAr] = useState(displayNameAr ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initialDescriptionEn ?? "");
  const [descriptionAr, setDescriptionAr] = useState(initialDescriptionAr ?? "");
  const [iso, setIso] = useState(isoCode ?? "");
  const [currency, setCurrency] = useState(currencyCode ?? "");
  const [countryId, setCountryId] = useState(initialCountryId ?? "");
  const [regionId, setRegionId] = useState(initialRegionId ?? "");
  const [cityId, setCityId] = useState(initialCityId ?? "");
  const [category, setCategory] = useState(initialCategory ?? "");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [isMosque, setIsMosque] = useState(initialIsMosque === true);
  const [isFood, setIsFood] = useState(initialIsFood === true);
  const [isRestroom, setIsRestroom] = useState(initialIsRestroom === true);
  const [asAds, setAsAds] = useState(initialAsAds === true);
  const [rate, setRate] = useState(
    initialRate != null && Number.isFinite(initialRate) ? String(initialRate) : "",
  );
  const [lat, setLat] = useState<number | null>(
    initialLat != null && Number.isFinite(initialLat) ? initialLat : null,
  );
  const [lng, setLng] = useState<number | null>(
    initialLng != null && Number.isFinite(initialLng) ? initialLng : null,
  );
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

  const filteredCities = useMemo(() => {
    if (resource !== "landmark" || !regionId.trim()) return cities;
    const hasRegion = cities.some((c) => c.regionId != null && c.regionId !== "");
    if (!hasRegion) return cities;
    return cities.filter((c) => c.regionId === regionId);
  }, [cities, regionId, resource]);

  useEffect(() => {
    if (resource !== "landmark" || !cityId) return;
    if (!filteredCities.some((c) => c.id === cityId)) setCityId("");
  }, [filteredCities, cityId, resource]);

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
          regionId?: string | null;
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
          ...(c.regionId != null && c.regionId !== ""
            ? { regionId: c.regionId }
            : {}),
        })),
      );
    },
    [apiFetch, locale],
  );

  useEffect(() => {
    if (!open) return;
    if (resource !== "country") void loadCountries();
  }, [open, resource, loadCountries]);

  useEffect(() => {
    if (!open || !countryId) return;
    if (resource === "city" || resource === "landmark" || resource === "region") {
      void loadRegions(countryId);
    }
    if (resource === "landmark") void loadCities(countryId);
  }, [open, countryId, resource, loadRegions, loadCities]);

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const resetFromProps = () => {
    setNameEn(displayNameEn ?? "");
    setNameAr(displayNameAr ?? "");
    setDescriptionEn(initialDescriptionEn ?? "");
    setDescriptionAr(initialDescriptionAr ?? "");
    setIso(isoCode ?? "");
    setCurrency(currencyCode ?? "");
    setCountryId(initialCountryId ?? "");
    setRegionId(initialRegionId ?? "");
    setCityId(initialCityId ?? "");
    setCategory(initialCategory ?? "");
    setAddress(initialAddress ?? "");
    setIsMosque(initialIsMosque === true);
    setIsFood(initialIsFood === true);
    setIsRestroom(initialIsRestroom === true);
    setAsAds(initialAsAds === true);
    setRate(
      initialRate != null && Number.isFinite(initialRate)
        ? String(initialRate)
        : "",
    );
    setLat(
      initialLat != null && Number.isFinite(initialLat) ? initialLat : null,
    );
    setLng(
      initialLng != null && Number.isFinite(initialLng) ? initialLng : null,
    );
  };

  const run = async () => {
    if (inFlight.current) return;
    if (!nameEn.trim() || !nameAr.trim()) {
      setError(t("error"));
      return;
    }
    if (
      (resource === "city" || resource === "landmark") &&
      (lat != null || lng != null) &&
      !isValidCoord(lat, lng)
    ) {
      setError(t("error"));
      return;
    }
    const rateN = rate.trim() ? Number(rate) : undefined;
    if (
      rate.trim() &&
      (rateN == null || !Number.isFinite(rateN) || rateN < 0 || rateN > 5)
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
        `/api/geography/${resource}/${encodeURIComponent(resourceId)}/update_metadata`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": `geo-edit-${resource}-${resourceId}-${Date.now()}`,
          },
          body: JSON.stringify({
            expectedActive: active,
            preconditionToken,
            reasonCode: "operational",
            metadata: {
              displayNameEn: nameEn.trim(),
              displayNameAr: nameAr.trim(),
              ...(descriptionEn.trim()
                ? { descriptionEn: descriptionEn.trim() }
                : {}),
              ...(descriptionAr.trim()
                ? { descriptionAr: descriptionAr.trim() }
                : {}),
              ...(resource === "country" && iso.trim()
                ? { isoCode: iso.trim() }
                : {}),
              ...(resource === "country" && currency.trim()
                ? { currencyCode: currency.trim() }
                : {}),
              ...(countryId.trim() ? { countryId: countryId.trim() } : {}),
              ...(regionId.trim() ? { regionId: regionId.trim() } : {}),
              ...(cityId.trim() ? { cityId: cityId.trim() } : {}),
              ...(category.trim() ? { category: category.trim() } : {}),
              ...(address.trim() ? { address: address.trim() } : {}),
              ...(resource === "landmark"
                ? {
                    isMosque,
                    isFood,
                    isRestroom,
                    asAds,
                  }
                : {}),
              ...(rateN != null ? { rate: rateN } : {}),
              ...(isValidCoord(lat, lng) ? { lat: lat!, lng: lng! } : {}),
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
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const showDescriptions = resource === "city" || resource === "landmark";
  const showMap = resource === "city" || resource === "landmark";

  return (
    <section
      data-testid={`geography-edit-${resource}`}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {t("geographyEditAction")}
        </h3>
        {!open ? (
          <button
            type="button"
            className={adminUi.btnSecondary}
            data-testid={`geography-edit-open-${resource}`}
            onClick={() => {
              resetFromProps();
              setOpen(true);
              setError(undefined);
              setSuccess(undefined);
            }}
          >
            {t("geographyEditAction")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("name")} (EN)
                <RequiredMark />
              </span>
              <input
                className={adminUi.filterControl}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("name")} (AR)
                <RequiredMark />
              </span>
              <input
                className={adminUi.filterControl}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                dir="rtl"
              />
            </label>
            {showDescriptions ? (
              <>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-600">
                    {t("description")} (EN)
                  </span>
                  <textarea
                    className={adminUi.filterControl}
                    rows={3}
                    value={descriptionEn}
                    onChange={(e) => setDescriptionEn(e.target.value)}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-600">
                    {t("description")} (AR)
                  </span>
                  <textarea
                    className={adminUi.filterControl}
                    rows={3}
                    dir="rtl"
                    value={descriptionAr}
                    onChange={(e) => setDescriptionAr(e.target.value)}
                  />
                </label>
              </>
            ) : null}
            {resource === "country" ? (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("isoCode")}</span>
                  <input
                    className={adminUi.filterControl}
                    value={iso}
                    maxLength={2}
                    onChange={(e) => setIso(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("currency")}</span>
                  <input
                    className={adminUi.filterControl}
                    value={currency}
                    maxLength={3}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </label>
              </>
            ) : null}
            {resource !== "country" ? (
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">{t("country")}</span>
                <select
                  className={adminUi.filterControl}
                  value={countryId}
                  onChange={(e) => {
                    setCountryId(e.target.value);
                    setRegionId("");
                    setCityId("");
                  }}
                >
                  <option value="">{t("selectCountry")}</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {resource === "city" || resource === "landmark" || resource === "region" ? (
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">{t("region")}</span>
                <select
                  className={adminUi.filterControl}
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    setCityId("");
                  }}
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
                  <span className="mb-1 block text-slate-600">{t("city")}</span>
                  <select
                    className={adminUi.filterControl}
                    value={cityId}
                    onChange={(e) => setCityId(e.target.value)}
                    disabled={!countryId}
                  >
                    <option value="">{t("selectCity")}</option>
                    {filteredCities.map((c) => (
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
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-600">{t("address")}</span>
                  <input
                    className={adminUi.filterControl}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </label>
                <fieldset className="text-sm sm:col-span-2">
                  <legend className="mb-1 text-slate-600">{t("amenities")}</legend>
                  <div className="flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isMosque}
                        onChange={(e) => setIsMosque(e.target.checked)}
                      />
                      {t("isMosque")}
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isFood}
                        onChange={(e) => setIsFood(e.target.checked)}
                      />
                      {t("isFood")}
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isRestroom}
                        onChange={(e) => setIsRestroom(e.target.checked)}
                      />
                      {t("isRestroom")}
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={asAds}
                        onChange={(e) => setAsAds(e.target.checked)}
                      />
                      {t("asAds")}
                    </label>
                  </div>
                </fieldset>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">{t("rating")}</span>
                  <input
                    className={adminUi.filterControl}
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </label>
              </>
            ) : null}
            {showMap ? (
              <LocationMapPicker
                testIdPrefix={`geography-edit-map-${resource}`}
                lat={lat}
                lng={lng}
                required={false}
                onChange={({ lat: nextLat, lng: nextLng }) => {
                  setLat(nextLat);
                  setLng(nextLng);
                }}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminUi.btnPrimary}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              {t("save")}
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
              testIdPrefix={`geography-edit-${resource}`}
              confirmTemplateKey="confirmGeographyWrite"
              actionLabelKey="geographyEditAction"
              targetId={resourceId}
              stateLabel={active == null ? t("unknown") : String(active)}
              pending={pending}
              onConfirm={() => void run()}
              onCancel={() => setConfirming(false)}
            />
          ) : null}
          {error ? (
            <p className="text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm text-emerald-700" role="status">
              {success}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
