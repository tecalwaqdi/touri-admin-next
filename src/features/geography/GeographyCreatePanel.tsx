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
import { LEGACY_DEFAULT_LANDMARK_CATEGORY } from "@/application/controlled-writes/geography/GeographyLegacyWriteFields";
import { LandmarkCategorySelect } from "@/features/geography/LandmarkCategorySelect";
import {
  GeographyCreateImageStaging,
  useStagedGeographyImages,
} from "@/features/geography/GeographyCreateImageStaging";

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
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [isoCode, setIsoCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [currencySymbol, setCurrencySymbol] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [appCommissionPercent, setAppCommissionPercent] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [category, setCategory] = useState(LEGACY_DEFAULT_LANDMARK_CATEGORY);
  const [address, setAddress] = useState("");
  const [isMosque, setIsMosque] = useState(false);
  const [isFood, setIsFood] = useState(false);
  const [isRestroom, setIsRestroom] = useState(false);
  const [asAds, setAsAds] = useState(false);
  const [rate, setRate] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [countries, setCountries] = useState<Option[]>([]);
  const [regions, setRegions] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);
  const landmarkImages = useStagedGeographyImages(3);
  const singleImages = useStagedGeographyImages(1);

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

  const uploadStagedAfterCreate = async (id: string): Promise<string | null> => {
    if (resource === "landmark") {
      for (const { slot, file } of landmarkImages.entries) {
        const form = new FormData();
        form.set("action", "replace_landmark_image");
        form.set("slotOrIndex", slot);
        form.set("file", file, file.name);
        const res = await apiFetch(
          `/api/storage/landmarks/${encodeURIComponent(id)}/images`,
          {
            method: "POST",
            headers: {
              "idempotency-key": `lm-img-create-${id}-${slot}-${Date.now()}`,
            },
            body: form,
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          message?: string;
          error?: string;
        };
        if (!res.ok || json.ok === false) {
          return json.message ?? json.error ?? json.code ?? t("error");
        }
      }
      return null;
    }
    if (resource === "city" || resource === "country") {
      const entry = singleImages.entries[0];
      if (!entry) return null;
      const form = new FormData();
      form.set(
        "action",
        resource === "city" ? "replace_city_image" : "replace_country_image",
      );
      form.set("slotOrIndex", "0");
      form.set("file", entry.file, entry.file.name);
      const path =
        resource === "city"
          ? `/api/storage/cities/${encodeURIComponent(id)}/images`
          : `/api/storage/countries/${encodeURIComponent(id)}/images`;
      const res = await apiFetch(path, {
        method: "POST",
        headers: {
          "idempotency-key": `${resource}-img-create-${id}-${Date.now()}`,
        },
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        return json.message ?? json.error ?? json.code ?? t("error");
      }
    }
    return null;
  };

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
    if (resource === "landmark" && !category.trim()) {
      setError(t("error"));
      return;
    }
    if (resource === "landmark" && !isValidCoord(lat, lng)) {
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
    const vatN = vatPercent.trim() ? Number(vatPercent) : undefined;
    if (
      vatPercent.trim() &&
      (vatN == null || !Number.isFinite(vatN) || vatN < 0)
    ) {
      setError(t("error"));
      return;
    }
    const commissionN = appCommissionPercent.trim()
      ? Number(appCommissionPercent)
      : undefined;
    if (
      appCommissionPercent.trim() &&
      (commissionN == null || !Number.isFinite(commissionN) || commissionN < 0)
    ) {
      setError(t("error"));
      return;
    }
    const sortN = sortOrder.trim() ? Number(sortOrder) : undefined;
    if (
      sortOrder.trim() &&
      (sortN == null || !Number.isFinite(sortN))
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
              ...(descriptionEn.trim()
                ? { descriptionEn: descriptionEn.trim() }
                : {}),
              ...(descriptionAr.trim()
                ? { descriptionAr: descriptionAr.trim() }
                : {}),
              ...(resource === "country" && isoCode.trim()
                ? { isoCode: isoCode.trim() }
                : {}),
              ...(resource === "country" && currencyCode.trim()
                ? { currencyCode: currencyCode.trim() }
                : {}),
              ...(resource === "country" && currencySymbol.trim()
                ? { currencySymbol: currencySymbol.trim() }
                : {}),
              ...(resource === "country" && vatN != null
                ? { vatPercent: vatN }
                : {}),
              ...(resource === "country" && commissionN != null
                ? { appCommissionPercent: commissionN }
                : {}),
              ...((resource === "country" || resource === "region") &&
              sortN != null
                ? { sortOrder: sortN }
                : {}),
              ...(countryId.trim() ? { countryId: countryId.trim() } : {}),
              ...(regionId.trim() ? { regionId: regionId.trim() } : {}),
              ...(cityId.trim() ? { cityId: cityId.trim() } : {}),
              ...(resource === "landmark"
                ? {
                    category:
                      category.trim() || LEGACY_DEFAULT_LANDMARK_CATEGORY,
                  }
                : {}),
              ...(address.trim() ? { address: address.trim() } : {}),
              ...(isMosque ? { isMosque: true } : {}),
              ...(isFood ? { isFood: true } : {}),
              ...(isRestroom ? { isRestroom: true } : {}),
              ...(asAds ? { asAds: true } : {}),
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
      const uploadErr = await uploadStagedAfterCreate(id);
      if (uploadErr) {
        setError(uploadErr);
        setSuccess(t("writeApplied"));
        setConfirming(false);
        onCreated?.(id);
        return;
      }
      landmarkImages.clearAll();
      singleImages.clearAll();
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

  const showDescriptions =
    resource === "country" ||
    resource === "region" ||
    resource === "city" ||
    resource === "landmark";
  const showMap = resource === "city" || resource === "landmark";

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
            {resource === "landmark" ? (
              <GeographyCreateImageStaging
                mode="landmark"
                staged={landmarkImages.staged}
                disabled={pending}
                onPick={(slot, file) => landmarkImages.setSlot(slot, file)}
                onClear={(slot) => landmarkImages.setSlot(slot, null)}
              />
            ) : null}
            {resource === "city" ? (
              <GeographyCreateImageStaging
                mode="city"
                staged={singleImages.staged}
                disabled={pending}
                onPick={(slot, file) => singleImages.setSlot(slot, file)}
                onClear={(slot) => singleImages.setSlot(slot, null)}
              />
            ) : null}
            {resource === "country" ? (
              <GeographyCreateImageStaging
                mode="country"
                staged={singleImages.staged}
                disabled={pending}
                onPick={(slot, file) => singleImages.setSlot(slot, file)}
                onClear={(slot) => singleImages.setSlot(slot, null)}
              />
            ) : null}
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
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">
                    {t("currencySymbol")}
                  </span>
                  <input
                    className={adminUi.filterControl}
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">
                    {t("vatPercent")}
                  </span>
                  <input
                    className={adminUi.filterControl}
                    type="number"
                    min={0}
                    step={0.1}
                    value={vatPercent}
                    onChange={(e) => setVatPercent(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">
                    {t("appCommissionPercent")}
                  </span>
                  <input
                    className={adminUi.filterControl}
                    type="number"
                    min={0}
                    step={0.1}
                    value={appCommissionPercent}
                    onChange={(e) => setAppCommissionPercent(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">
                    {t("sortOrder")}
                  </span>
                  <input
                    className={adminUi.filterControl}
                    type="number"
                    step={1}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  />
                </label>
              </>
            ) : null}
            {resource === "region" ? (
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">
                  {t("sortOrder")}
                </span>
                <input
                  className={adminUi.filterControl}
                  type="number"
                  step={1}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </label>
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
                    {filteredCities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <LandmarkCategorySelect
                  value={category}
                  onChange={setCategory}
                  required
                  testId="geography-create-landmark-category"
                />
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
                testIdPrefix={`geography-create-map-${resource}`}
                lat={lat}
                lng={lng}
                required={resource === "landmark"}
                onChange={({ lat: nextLat, lng: nextLng }) => {
                  setLat(nextLat);
                  setLng(nextLng);
                }}
              />
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
