"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import {
  isValidGeoLatLng,
  normalizeGeoBounds,
  type GeoBoundsBox,
} from "@/domain/geography/GeoBounds";

const EMPTY_CENTER: L.LatLngExpression = [20, 0];
const EMPTY_ZOOM = 2;

export type CountryBoundsValue = {
  swLat: number | null;
  swLng: number | null;
  neLat: number | null;
  neLng: number | null;
};

export type CountryBoundsMapPickerProps = {
  value: CountryBoundsValue;
  onChange: (next: CountryBoundsValue) => void;
  /** When set to a valid ISO-2 and bounds are empty, auto-fill from Nominatim. */
  isoCode?: string | null;
  disabled?: boolean;
  testIdPrefix?: string;
  className?: string;
};

type GeocodeHit = {
  lat: number;
  lng: number;
  label: string;
  bounds?: {
    swLat: number;
    swLng: number;
    neLat: number;
    neLng: number;
  } | null;
};

function boxFromValue(v: CountryBoundsValue): GeoBoundsBox | null {
  return normalizeGeoBounds({
    swLat: v.swLat,
    swLng: v.swLng,
    neLat: v.neLat,
    neLng: v.neLng,
  });
}

function emptyBounds(): CountryBoundsValue {
  return { swLat: null, swLng: null, neLat: null, neLng: null };
}

/**
 * Country operational bounds picker — search OSM country → fill SW/NE box,
 * or drag SW/NE corner markers. Writes Legacy bounds_sw / bounds_ne / geo_center.
 */
export function CountryBoundsMapPicker({
  value,
  onChange,
  isoCode = null,
  disabled = false,
  testIdPrefix = "country-bounds-map",
  className,
}: CountryBoundsMapPickerProps) {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const swMarkerRef = useRef<L.Marker | null>(null);
  const neMarkerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const drawModeRef = useRef(false);
  const lastIsoLookupRef = useRef<string>("");

  const box = boxFromValue(value);
  const [swLatText, setSwLatText] = useState(value.swLat != null ? String(value.swLat) : "");
  const [swLngText, setSwLngText] = useState(value.swLng != null ? String(value.swLng) : "");
  const [neLatText, setNeLatText] = useState(value.neLat != null ? String(value.neLat) : "");
  const [neLngText, setNeLngText] = useState(value.neLng != null ? String(value.neLng) : "");
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHits, setSearchHits] = useState<GeocodeHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const drawCornerRef = useRef<"sw" | null>(null);
  drawModeRef.current = drawMode;

  useEffect(() => {
    const iso = (isoCode ?? "").trim().toUpperCase();
    if (disabled || !/^[A-Z]{2}$/.test(iso)) return;
    if (lastIsoLookupRef.current === iso) return;
    const cur = valueRef.current;
    const hasBounds = normalizeGeoBounds({
      swLat: cur.swLat,
      swLng: cur.swLng,
      neLat: cur.neLat,
      neLng: cur.neLng,
    });
    if (hasBounds) {
      lastIsoLookupRef.current = iso;
      return;
    }
    lastIsoLookupRef.current = iso;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(
          `/api/geography/geocode?featureType=country&iso=${encodeURIComponent(iso)}`,
        );
        const json = (await res.json().catch(() => ({}))) as {
          items?: GeocodeHit[];
        };
        if (cancelled || !res.ok) return;
        const hit =
          (json.items ?? []).find((h) => h.bounds != null) ??
          (json.items ?? [])[0];
        if (!hit) return;
        // Don't clobber if user filled bounds while request was in flight
        const stillEmpty = !normalizeGeoBounds({
          swLat: valueRef.current.swLat,
          swLng: valueRef.current.swLng,
          neLat: valueRef.current.neLat,
          neLng: valueRef.current.neLng,
        });
        if (!stillEmpty) return;
        if (hit.bounds) {
          onChangeRef.current({
            swLat: hit.bounds.swLat,
            swLng: hit.bounds.swLng,
            neLat: hit.bounds.neLat,
            neLng: hit.bounds.neLng,
          });
        } else {
          const pad = 0.5;
          onChangeRef.current({
            swLat: hit.lat - pad,
            swLng: hit.lng - pad,
            neLat: hit.lat + pad,
            neLng: hit.lng + pad,
          });
        }
        setSearchQ(hit.label);
      } catch {
        // Soft-fail — user can still search/draw manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, disabled, isoCode]);

  useEffect(() => {
    setSwLatText(value.swLat != null ? String(value.swLat) : "");
    setSwLngText(value.swLng != null ? String(value.swLng) : "");
    setNeLatText(value.neLat != null ? String(value.neLat) : "");
    setNeLngText(value.neLng != null ? String(value.neLng) : "");
  }, [value.swLat, value.swLng, value.neLat, value.neLng]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const map = L.map(mapEl.current, {
      center: box
        ? [(box.sw.lat + box.ne.lat) / 2, (box.sw.lng + box.ne.lng) / 2]
        : EMPTY_CENTER,
      zoom: box ? 5 : EMPTY_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (disabledRef.current) return;
      if (!drawModeRef.current) return;
      const { lat, lng } = e.latlng;
      if (drawCornerRef.current === null) {
        drawCornerRef.current = "sw";
        onChangeRef.current({
          swLat: lat,
          swLng: lng,
          neLat: null,
          neLng: null,
        });
        return;
      }
      const cur = valueRef.current;
      onChangeRef.current({
        swLat: cur.swLat,
        swLng: cur.swLng,
        neLat: lat,
        neLng: lng,
      });
      drawCornerRef.current = null;
      setDrawMode(false);
    });

    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      rectRef.current = null;
      swMarkerRef.current = null;
      neMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const makeCornerIcon = (color: string) =>
      L.divIcon({
        className: "",
        html: `<span style="display:block;width:14px;height:14px;border-radius:2px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

    const clearOverlay = () => {
      rectRef.current?.remove();
      rectRef.current = null;
      swMarkerRef.current?.remove();
      swMarkerRef.current = null;
      neMarkerRef.current?.remove();
      neMarkerRef.current = null;
    };

    if (!box) {
      if (
        isValidGeoLatLng(value.swLat, value.swLng) &&
        !isValidGeoLatLng(value.neLat, value.neLng)
      ) {
        clearOverlay();
        swMarkerRef.current = L.marker([value.swLat!, value.swLng!], {
          draggable: !disabled,
          icon: makeCornerIcon("#0f766e"),
        }).addTo(map);
        return;
      }
      clearOverlay();
      return;
    }

    const bounds = L.latLngBounds(
      [box.sw.lat, box.sw.lng],
      [box.ne.lat, box.ne.lng],
    );

    if (!rectRef.current) {
      rectRef.current = L.rectangle(bounds, {
        color: "#0f766e",
        weight: 2,
        fillOpacity: 0.12,
      }).addTo(map);
      map.fitBounds(bounds.pad(0.15));
    } else {
      rectRef.current.setBounds(bounds);
    }

    const syncMarker = (
      ref: { current: L.Marker | null },
      lat: number,
      lng: number,
      color: string,
      which: "sw" | "ne",
    ) => {
      if (!ref.current) {
        const marker = L.marker([lat, lng], {
          draggable: !disabled,
          icon: makeCornerIcon(color),
        }).addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          const cur = valueRef.current;
          if (which === "sw") {
            onChangeRef.current({
              swLat: p.lat,
              swLng: p.lng,
              neLat: cur.neLat,
              neLng: cur.neLng,
            });
          } else {
            onChangeRef.current({
              swLat: cur.swLat,
              swLng: cur.swLng,
              neLat: p.lat,
              neLng: p.lng,
            });
          }
        });
        ref.current = marker;
      } else {
        const cur = ref.current.getLatLng();
        if (Math.abs(cur.lat - lat) > 1e-9 || Math.abs(cur.lng - lng) > 1e-9) {
          ref.current.setLatLng([lat, lng]);
        }
        if (disabled) ref.current.dragging?.disable();
        else ref.current.dragging?.enable();
      }
    };

    syncMarker(swMarkerRef, box.sw.lat, box.sw.lng, "#0f766e", "sw");
    syncMarker(neMarkerRef, box.ne.lat, box.ne.lng, "#b45309", "ne");
  }, [box, value, disabled]);

  const commitTexts = () => {
    const swLat = swLatText.trim() ? Number(swLatText) : null;
    const swLng = swLngText.trim() ? Number(swLngText) : null;
    const neLat = neLatText.trim() ? Number(neLatText) : null;
    const neLng = neLngText.trim() ? Number(neLngText) : null;
    if (!swLatText && !swLngText && !neLatText && !neLngText) {
      onChange(emptyBounds());
      return;
    }
    onChange({ swLat, swLng, neLat, neLng });
  };

  const runSearch = async () => {
    const q = searchQ.trim();
    if (q.length < 2) return;
    setSearchBusy(true);
    setSearchError(null);
    setSearchHits([]);
    try {
      const res = await apiFetch(
        `/api/geography/geocode?featureType=country&q=${encodeURIComponent(q)}`,
      );
      const json = (await res.json().catch(() => ({}))) as {
        items?: GeocodeHit[];
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setSearchError(json.error ?? json.code ?? t("error"));
        return;
      }
      setSearchHits(json.items ?? []);
      if (!(json.items ?? []).length) {
        setSearchError(t("locationSearchEmpty"));
      }
    } catch {
      setSearchError(t("error"));
    } finally {
      setSearchBusy(false);
    }
  };

  const applyHit = (hit: GeocodeHit) => {
    if (hit.bounds) {
      onChange({
        swLat: hit.bounds.swLat,
        swLng: hit.bounds.swLng,
        neLat: hit.bounds.neLat,
        neLng: hit.bounds.neLng,
      });
    } else {
      // Fallback: small box around center when Nominatim omits bbox
      const pad = 0.5;
      onChange({
        swLat: hit.lat - pad,
        swLng: hit.lng - pad,
        neLat: hit.lat + pad,
        neLng: hit.lng + pad,
      });
    }
    setSearchHits([]);
    setSearchQ(hit.label);
    setDrawMode(false);
    drawCornerRef.current = null;
  };

  return (
    <div
      data-testid={testIdPrefix}
      className={className ?? "space-y-2 sm:col-span-2"}
    >
      <p className="text-xs text-slate-500">{t("countryBoundsHint")}</p>

      {!disabled ? (
        <div className="space-y-2" data-testid={`${testIdPrefix}-search`}>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              {t("countryBoundsSearchLabel")}
            </span>
            <div className="flex flex-wrap gap-2">
              <input
                data-testid={`${testIdPrefix}-search-q`}
                className={`${adminUi.filterControl} min-w-[16rem] flex-1`}
                value={searchQ}
                placeholder={t("countryBoundsSearchPlaceholder")}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
              />
              <button
                type="button"
                className={adminUi.btnGhost}
                data-testid={`${testIdPrefix}-search-go`}
                disabled={searchBusy || searchQ.trim().length < 2}
                onClick={() => void runSearch()}
              >
                {searchBusy ? t("loading") : t("locationSearchGo")}
              </button>
              <button
                type="button"
                className={adminUi.btnGhost}
                data-testid={`${testIdPrefix}-draw`}
                aria-pressed={drawMode}
                onClick={() => {
                  setDrawMode((d) => !d);
                  drawCornerRef.current = null;
                }}
              >
                {drawMode ? t("countryBoundsDrawActive") : t("countryBoundsDraw")}
              </button>
              {box ? (
                <button
                  type="button"
                  className={adminUi.btnGhost}
                  data-testid={`${testIdPrefix}-clear`}
                  onClick={() => {
                    onChange(emptyBounds());
                    setDrawMode(false);
                    drawCornerRef.current = null;
                  }}
                >
                  {t("countryBoundsClear")}
                </button>
              ) : null}
            </div>
          </label>
          {searchError ? (
            <p className="text-xs text-rose-700" role="alert">
              {searchError}
            </p>
          ) : null}
          {searchHits.length ? (
            <ul
              className="max-h-40 overflow-auto rounded border border-slate-200 bg-white text-sm"
              data-testid={`${testIdPrefix}-hits`}
            >
              {searchHits.map((hit, i) => (
                <li key={`${hit.label}-${i}`}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-start hover:bg-slate-50"
                    onClick={() => applyHit(hit)}
                  >
                    <span className="block">{hit.label}</span>
                    {hit.bounds ? (
                      <span className="block font-mono text-xs text-slate-500">
                        {hit.bounds.swLat.toFixed(2)},{hit.bounds.swLng.toFixed(2)} →{" "}
                        {hit.bounds.neLat.toFixed(2)},{hit.bounds.neLng.toFixed(2)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t("boundsSw")}</span>
          <div className="flex flex-wrap gap-2">
            <input
              data-testid={`${testIdPrefix}-sw-lat`}
              className={adminUi.filterControl}
              inputMode="decimal"
              disabled={disabled}
              value={swLatText}
              placeholder={t("latitude")}
              onChange={(e) => setSwLatText(e.target.value)}
              onBlur={commitTexts}
            />
            <input
              data-testid={`${testIdPrefix}-sw-lng`}
              className={adminUi.filterControl}
              inputMode="decimal"
              disabled={disabled}
              value={swLngText}
              placeholder={t("longitude")}
              onChange={(e) => setSwLngText(e.target.value)}
              onBlur={commitTexts}
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t("boundsNe")}</span>
          <div className="flex flex-wrap gap-2">
            <input
              data-testid={`${testIdPrefix}-ne-lat`}
              className={adminUi.filterControl}
              inputMode="decimal"
              disabled={disabled}
              value={neLatText}
              placeholder={t("latitude")}
              onChange={(e) => setNeLatText(e.target.value)}
              onBlur={commitTexts}
            />
            <input
              data-testid={`${testIdPrefix}-ne-lng`}
              className={adminUi.filterControl}
              inputMode="decimal"
              disabled={disabled}
              value={neLngText}
              placeholder={t("longitude")}
              onChange={(e) => setNeLngText(e.target.value)}
              onBlur={commitTexts}
            />
          </div>
        </label>
      </div>

      <div
        ref={mapEl}
        data-testid={`${testIdPrefix}-canvas`}
        className="h-64 w-full overflow-hidden rounded border border-slate-200"
      />
      {drawMode ? (
        <p className="text-xs text-amber-800" role="status">
          {t("countryBoundsDrawHint")}
        </p>
      ) : null}
    </div>
  );
}
