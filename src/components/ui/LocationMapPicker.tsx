"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import { parseLocationPaste } from "@/domain/geography/parseLocationPaste";

/** Leaflet CSS is loaded from src/app/globals.css (avoids Vitest PostCSS on node_modules CSS). */

/** No silent Riyadh default — map starts world-view until coords exist. */
const EMPTY_CENTER: L.LatLngExpression = [20, 0];
const EMPTY_ZOOM = 2;
const PIN_ZOOM = 15;

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

export type LocationMapPickerProps = {
  lat: number | null;
  lng: number | null;
  onChange: (next: { lat: number | null; lng: number | null }) => void;
  required?: boolean;
  disabled?: boolean;
  testIdPrefix?: string;
  className?: string;
};

type GeocodeHit = { lat: number; lng: number; label: string };

/**
 * Interactive location picker — click + drag marker, lat/lng sync,
 * paste lat,lng / Google Maps URL, OSM Nominatim place search.
 * Does not invent default city coordinates (Legacy Admin suppress-default pattern).
 */
export function LocationMapPicker({
  lat,
  lng,
  onChange,
  required = false,
  disabled = false,
  testIdPrefix = "location-map",
  className,
}: LocationMapPickerProps) {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const hasPin = isValidCoord(lat, lng);
  const [latText, setLatText] = useState(hasPin ? String(lat) : "");
  const [lngText, setLngText] = useState(hasPin ? String(lng) : "");
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHits, setSearchHits] = useState<GeocodeHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    setLatText(hasPin ? String(lat) : "");
    setLngText(hasPin ? String(lng) : "");
  }, [hasPin, lat, lng]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const map = L.map(mapEl.current, {
      center: hasPin ? [lat!, lng!] : EMPTY_CENTER,
      zoom: hasPin ? PIN_ZOOM : EMPTY_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    const makeIcon = () =>
      L.divIcon({
        className: "",
        html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:#0f766e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

    if (hasPin) {
      const marker = L.marker([lat!, lng!], {
        draggable: !disabled,
        icon: makeIcon(),
      }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = marker;
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (disabled) return;
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const makeIcon = () =>
      L.divIcon({
        className: "",
        html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:#0f766e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

    if (!hasPin) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const pos: L.LatLngExpression = [lat!, lng!];
    if (!markerRef.current) {
      const marker = L.marker(pos, {
        draggable: !disabled,
        icon: makeIcon(),
      }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = marker;
      map.setView(pos, Math.max(map.getZoom(), PIN_ZOOM));
    } else {
      const cur = markerRef.current.getLatLng();
      if (Math.abs(cur.lat - lat!) > 1e-9 || Math.abs(cur.lng - lng!) > 1e-9) {
        markerRef.current.setLatLng(pos);
      }
      if (disabled) markerRef.current.dragging?.disable();
      else markerRef.current.dragging?.enable();
    }
  }, [hasPin, lat, lng, disabled]);

  const commitTexts = (nextLat: string, nextLng: string) => {
    const a = nextLat.trim();
    const b = nextLng.trim();
    if (!a && !b) {
      onChange({ lat: null, lng: null });
      return;
    }
    const parsedLat = Number(a);
    const parsedLng = Number(b);
    if (!isValidCoord(parsedLat, parsedLng)) return;
    onChange({ lat: parsedLat, lng: parsedLng });
  };

  const applyPaste = () => {
    setPasteError(null);
    const parsed = parseLocationPaste(pasteText);
    if (!parsed) {
      setPasteError(t("locationPasteInvalid"));
      return;
    }
    onChange({ lat: parsed.lat, lng: parsed.lng });
    setPasteText("");
  };

  const runSearch = async () => {
    const q = searchQ.trim();
    if (q.length < 2) return;
    setSearchBusy(true);
    setSearchError(null);
    setSearchHits([]);
    try {
      const res = await apiFetch(
        `/api/geography/geocode?q=${encodeURIComponent(q)}`,
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

  return (
    <div
      data-testid={testIdPrefix}
      className={className ?? "space-y-2 sm:col-span-2"}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {t("latitude")}
            {required ? <span className="text-rose-600"> *</span> : null}
          </span>
          <input
            data-testid={`${testIdPrefix}-lat`}
            className={adminUi.filterControl}
            inputMode="decimal"
            disabled={disabled}
            value={latText}
            placeholder="—"
            onChange={(e) => {
              setLatText(e.target.value);
              commitTexts(e.target.value, lngText);
            }}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {t("longitude")}
            {required ? <span className="text-rose-600"> *</span> : null}
          </span>
          <input
            data-testid={`${testIdPrefix}-lng`}
            className={adminUi.filterControl}
            inputMode="decimal"
            disabled={disabled}
            value={lngText}
            placeholder="—"
            onChange={(e) => {
              setLngText(e.target.value);
              commitTexts(latText, e.target.value);
            }}
          />
        </label>
        {hasPin && !disabled ? (
          <button
            type="button"
            className={adminUi.btnGhost}
            data-testid={`${testIdPrefix}-clear`}
            onClick={() => onChange({ lat: null, lng: null })}
          >
            {t("clearLocation")}
          </button>
        ) : null}
      </div>

      {!disabled ? (
        <div className="space-y-2" data-testid={`${testIdPrefix}-paste-search`}>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              {t("locationPasteLabel")}
            </span>
            <div className="flex flex-wrap gap-2">
              <input
                data-testid={`${testIdPrefix}-paste`}
                className={`${adminUi.filterControl} min-w-[16rem] flex-1`}
                disabled={disabled}
                value={pasteText}
                placeholder={t("locationPastePlaceholder")}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  setPasteError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyPaste();
                  }
                }}
              />
              <button
                type="button"
                className={adminUi.btnSecondary}
                data-testid={`${testIdPrefix}-paste-apply`}
                onClick={applyPaste}
              >
                {t("locationPasteApply")}
              </button>
            </div>
          </label>
          {pasteError ? (
            <p className="text-xs text-rose-700" role="alert">
              {pasteError}
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              {t("locationSearchLabel")}
            </span>
            <div className="flex flex-wrap gap-2">
              <input
                data-testid={`${testIdPrefix}-search`}
                className={`${adminUi.filterControl} min-w-[16rem] flex-1`}
                disabled={disabled || searchBusy}
                value={searchQ}
                placeholder={t("locationSearchPlaceholder")}
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
                className={adminUi.btnSecondary}
                data-testid={`${testIdPrefix}-search-go`}
                disabled={searchBusy || searchQ.trim().length < 2}
                onClick={() => void runSearch()}
              >
                {t("locationSearchGo")}
              </button>
            </div>
          </label>
          {searchError ? (
            <p className="text-xs text-amber-700" role="status">
              {searchError}
            </p>
          ) : null}
          {searchHits.length > 0 ? (
            <ul
              className="max-h-36 space-y-1 overflow-auto rounded border border-slate-200 bg-white p-2 text-sm"
              data-testid={`${testIdPrefix}-search-results`}
            >
              {searchHits.map((hit, i) => (
                <li key={`${hit.lat}-${hit.lng}-${i}`}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1 text-start hover:bg-slate-50"
                    data-testid={`${testIdPrefix}-search-hit-${i}`}
                    onClick={() => {
                      onChange({ lat: hit.lat, lng: hit.lng });
                      setSearchHits([]);
                      setSearchQ(hit.label);
                    }}
                  >
                    {hit.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className={adminUi.caption}>{t("mapPickerHint")}</p>
      <div
        ref={mapEl}
        data-testid={`${testIdPrefix}-canvas`}
        className="z-0 h-64 w-full overflow-hidden rounded-lg border border-slate-200"
      />
      {!hasPin && required ? (
        <p className="text-xs text-amber-700" role="status">
          {t("mapLocationRequired")}
        </p>
      ) : null}
    </div>
  );
}
