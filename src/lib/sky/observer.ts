import { DEFAULT_OBSERVER, ObserverSpec } from "./constants";
import {
  LightPollution,
  limitingMagnitudeForBortle,
  magToBortle,
} from "./lightPollution";

export interface SkyOverrides {
  /** Fixed instant for testing (from ?sky= or ?skyUtc=). */
  date?: Date;
  /** Fixed observer for testing (from ?lat=&lon=). */
  observer?: ObserverSpec;
  /** Fixed light pollution for testing (from ?bortle= / ?mag=). */
  pollution?: LightPollution;
}

function finiteQueryNumber(params: URLSearchParams, name: string): number | undefined {
  const value = params.get(name);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function queryDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

/**
 * Development / manual-testing overrides read from the URL query string.
 * Examples:
 *   ?sky=2026-12-21T22:00            (local time, no timezone)
 *   ?skyUtc=2026-10-07T18:00:00Z     (explicit UTC; wins over ?sky)
 *   ?lat=40.7&lon=-74.0              (custom observer)
 *   ?bortle=3  or  ?mag=6.0          (custom light pollution, highest priority)
 * Everything is optional and harmless in production.
 */
export function readOverrides(): SkyOverrides {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const overrides: SkyOverrides = {};

  // ?skyUtc has priority over ?sky when both are present.
  const date = queryDate(params.get("skyUtc")) ?? queryDate(params.get("sky"));
  if (date) overrides.date = date;

  const lat = finiteQueryNumber(params, "lat");
  const lon = finiteQueryNumber(params, "lon");
  if (lat !== undefined && lon !== undefined && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    overrides.observer = {
      name: "Custom observer",
      latitude: lat,
      longitude: lon,
      source: "override",
    };
  }

  const bortle = finiteQueryNumber(params, "bortle");
  const mag = finiteQueryNumber(params, "mag");
  if (bortle !== undefined || mag !== undefined) {
    const resolvedBortle = bortle === undefined ? undefined : Math.min(9, Math.max(1, bortle));
    const limitingMagnitude = mag ?? limitingMagnitudeForBortle(resolvedBortle as number);
    overrides.pollution = {
      limitingMagnitude,
      bortleApprox: mag === undefined ? (resolvedBortle as number) : magToBortle(limitingMagnitude),
      lightProxy: Number.NaN,
      source: "override",
    };
  }

  return overrides;
}

export function defaultObserver(): ObserverSpec {
  return { ...DEFAULT_OBSERVER };
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

/**
 * Browser geolocation, requested only after an explicit user gesture.
 * The result is used locally for astronomy only and never sent anywhere.
 */
export function requestUserLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("geolocation-unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  });
}
