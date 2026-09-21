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
import { presentStatus } from "@/domain/presentation/statusPresentation";

type Option = { id: string; label: string; regionId?: string };

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

type PartnerEditFields = {
  partnerLandmarkId: string;
  displayNameEn?: string | null;
  displayNameAr?: string | null;
  countryId: string | null;
  cityId: string | null;
  regionId?: string | null;
  addressText?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  activeStatus: string;
  coordinates?: { latitude: number; longitude: number } | null;
};

/**
 * Gated partner metadata edit — update_metadata via partners P0 route.
 */
export function PartnerEditPanel({
  partner,
  onUpdated,
}: {
  partner: PartnerEditFields;
  onUpdated?: () => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState(partner.displayNameEn ?? "");
  const [nameAr, setNameAr] = useState(partner.displayNameAr ?? "");
  const [descriptionEn, setDescriptionEn] = useState(
    partner.descriptionEn ?? "",
  );
  const [descriptionAr, setDescriptionAr] = useState(
    partner.descriptionAr ?? "",
  );
  const [countryId, setCountryId] = useState(partner.countryId ?? "");
  const [regionId, setRegionId] = useState(partner.regionId ?? "");
  const [cityId, setCityId] = useState(partner.cityId ?? "");
  const [address, setAddress] = useState(partner.addressText ?? "");
  const [lat, setLat] = useState<number | null>(
    partner.coordinates?.latitude ?? null,
  );
  const [lng, setLng] = useState<number | null>(
    partner.coordinates?.longitude ?? null,
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
        ? hasPermission(session.user.permissions, "agents:manage")
        : false,
    [session.user],
  );

  const filteredCities = useMemo(() => {
    if (!regionId.trim()) return cities;
    const hasRegion = cities.some((c) => c.regionId != null && c.regionId !== "");
    if (!hasRegion) return cities;
    return cities.filter((c) => c.regionId === regionId);
  }, [cities, regionId]);

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
    void loadCountries();
  }, [open, canWrite, loadCountries]);

  useEffect(() => {
    if (!open || !countryId) return;
    void loadRegions(countryId);
    void loadCities(countryId);
  }, [open, countryId, loadRegions, loadCities]);

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const run = async () => {
    if (inFlight.current) return;
    if (!nameEn.trim() || !nameAr.trim()) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const metadata: Record<string, string | number | boolean | null> = {
        displayNameEn: nameEn.trim(),
        displayNameAr: nameAr.trim(),
        isShrek: true,
      };
      if (countryId.trim()) metadata.countryId = countryId.trim();
      if (regionId.trim()) metadata.regionId = regionId.trim();
      if (cityId.trim()) metadata.cityId = cityId.trim();
      if (address.trim()) metadata.address = address.trim();
      if (descriptionEn.trim()) metadata.descriptionEn = descriptionEn.trim();
      if (descriptionAr.trim()) metadata.descriptionAr = descriptionAr.trim();
      if (isValidCoord(lat, lng)) {
        metadata.lat = lat!;
        metadata.lng = lng!;
      }

      const res = await apiFetch(
        `/api/partners/${encodeURIComponent(partner.partnerLandmarkId)}/update_metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: partner.partnerLandmarkId,
            reasonCode: "operational",
            metadata,
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

  return (
    <div data-testid="partner-edit" className="mb-3">
      {!open ? (
        <button
          type="button"
          className={adminUi.btnGhost}
          onClick={() => setOpen(true)}
        >
          {t("partnerEditAction")}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("name")} (EN)</span>
              <input
                className={adminUi.filterControl}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("name")} (AR)</span>
              <input
                className={adminUi.filterControl}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                dir="rtl"
              />
            </label>
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
                <option value="">—</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("region")}</span>
              <select
                className={adminUi.filterControl}
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
              >
                <option value="">—</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("city")}</span>
              <select
                className={adminUi.filterControl}
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
              >
                <option value="">—</option>
                {filteredCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">{t("address")}</span>
              <input
                className={adminUi.filterControl}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">
                {t("description")} (EN)
              </span>
              <textarea
                className={adminUi.filterControl}
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
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                dir="rtl"
              />
            </label>
          </div>
          <div className="mt-3">
            <LocationMapPicker
              lat={lat}
              lng={lng}
              onChange={(next) => {
                setLat(next.lat);
                setLng(next.lng);
              }}
              testIdPrefix="partner-edit-map"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={adminUi.btnPrimary}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              {t("partnerEditAction")}
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
              testIdPrefix="partner-edit"
              confirmTemplateKey="confirmAgentWrite"
              actionLabelKey="partnerEditAction"
              targetId={partner.partnerLandmarkId}
              stateLabel={presentStatus(
                partner.activeStatus,
                locale === "ar" ? "ar" : "en",
              )}
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
