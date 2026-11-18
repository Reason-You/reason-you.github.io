import { create } from "zustand";
import { Body } from "astronomy-engine";
import { ObserverSpec } from "@/lib/sky/constants";
import {
  FUDAN_FALLBACK,
  LightPollution,
  getLightPollution,
  limitingMagnitudeForBortle,
} from "@/lib/sky/lightPollution";
import { getBodyAltitude } from "@/lib/sky/astro";
import { shanghaiTonight } from "@/lib/sky/time";
import { defaultObserver, readOverrides, requestUserLocation } from "@/lib/sky/observer";
import type { DarkSkyDestination } from "@/lib/sky/destinations";
import {
  destinationObserver, destinationPollution, findNightPreviewTime, readSkyPreview, selectRandomSky,
} from "@/lib/sky/random-sky";

export type SkyPreference = "fudan" | "local";
export type SkyStatus = "default" | "locating" | "resetting" | "custom" | "error";
export type SkyLookMode = "city" | "ideal";

export const SKY_PREFERENCE_KEY = "sky-preference";

interface SkyStore {
  observer: ObserverSpec;
  pollution: LightPollution;
  /** ?bortle= / ?mag= wins over the real data. */
  pollutionOverride: LightPollution | null;
  dateOverride: number | null;
  skyLookMode: SkyLookMode;
  setSkyLookMode: (mode: SkyLookMode) => void;
  previewShanghaiTonight: () => void;
  backToLive: () => void;
  /** Added once to the live clock or fixed preview epoch. */
  timeOffsetMs: number;
  /** Instant of the frame actually drawn on Look Up, published after rendering. */
  snapshotDate: number | null;
  destination: DarkSkyDestination | null;
  nightPreview: boolean;
  detailsOpen: boolean;
  notice: string | null;
  toggleDetails: () => void;
  randomSky: () => void;
  setSnapshotDate: (timestamp: number, timeOffsetMs?: number) => void;
  setTimeOffset: (timeOffsetMs: number) => void;
  preference: SkyPreference;
  status: SkyStatus;
  /** Initialise once, then apply changed URL parameters on client navigation. */
  initialize: (query: string, starsAbove?: boolean) => Promise<void>;
  requestMySky: () => Promise<void>;
  resetSky: () => Promise<void>;
}

const IDEAL_DARK_SKY: LightPollution = {
  limitingMagnitude: limitingMagnitudeForBortle(1),
  bortleApprox: 1,
  lightProxy: 0,
  source: "override",
};

export function selectSkyPollution(state: SkyStore): LightPollution {
  return state.skyLookMode === "ideal" ? IDEAL_DARK_SKY : state.pollution;
}

export function isShanghaiDaylight(timestamp: number): boolean {
  return getBodyAltitude(Body.Sun, new Date(timestamp), defaultObserver()) >= 0;
}

function readPreference(): SkyPreference {
  try {
    return localStorage.getItem(SKY_PREFERENCE_KEY) === "local" ? "local" : "fudan";
  } catch {
    return "fudan";
  }
}

function savePreference(preference: SkyPreference): void {
  try {
    localStorage.setItem(SKY_PREFERENCE_KEY, preference);
  } catch {
    // The current session still works when persistent storage is unavailable.
  }
}

let requestSeq = 0;
let lastQuery: string | null = null;
let lastIdealScope = false;
let lastUrlObserver: ObserverSpec | undefined;

function replaceSkyQuery(update: (params: URLSearchParams) => void): void {
  if (typeof window === "undefined" || !onStarsAbove()) return;
  const url = new URL(window.location.href);
  update(url.searchParams);
  lastQuery = url.searchParams.toString();
  lastIdealScope = hasShanghaiLook(url.searchParams);
  window.history.replaceState(null, "", url);
}

function onStarsAbove(): boolean {
  return typeof window === "undefined" || window.location.pathname.replace(/\/$/, "") === "/stars-above";
}

function isIdealSkyLink(params: URLSearchParams): boolean {
  return !params.has("mag") && Number(params.get("bortle")) === 1;
}

function hasShanghaiLook(params: URLSearchParams): boolean {
  if (!isIdealSkyLink(params) && params.get("skyLook") !== "ideal") return false;
  const query = params.toString();
  const preview = readSkyPreview(query);
  return preview ? preview.kind === "fudan" : !readOverrides(query).observer;
}

function clearShanghaiLook(params: URLSearchParams): void {
  if (isIdealSkyLink(params)) params.delete("bortle");
  params.delete("skyLook");
}

export const useSkyStore = create<SkyStore>((set, get) => ({
  observer: defaultObserver(),
  pollution: { ...FUDAN_FALLBACK },
  pollutionOverride: null,
  dateOverride: null,
  skyLookMode: "city",
  setSkyLookMode: (skyLookMode) => {
    const state = get();
    if (state.observer.source !== "default") return;
    const timestamp = state.snapshotDate ?? (state.dateOverride ?? Date.now()) + state.timeOffsetMs;
    if (skyLookMode === "ideal" && isShanghaiDaylight(timestamp)) return;
    replaceSkyQuery(params => {
      if (skyLookMode === "ideal") {
        if (state.pollutionOverride === null) params.set("bortle", "1");
        else params.set("skyLook", "ideal");
      } else {
        clearShanghaiLook(params);
      }
      params.set("skyPreview", "fudan");
    });
    set({ skyLookMode });
  },
  previewShanghaiTonight: () => {
    const state = get();
    if (state.observer.source !== "default") return;
    const timestamp = state.snapshotDate ?? (state.dateOverride ?? Date.now()) + state.timeOffsetMs;
    const dateOverride = shanghaiTonight(timestamp);
    replaceSkyQuery(params => {
      params.set("skyUtc", new Date(dateOverride).toISOString());
      params.delete("sky");
      params.set("skyLook", "ideal");
      params.set("skyPreview", "fudan");
    });
    set({ dateOverride, timeOffsetMs: 0,
      skyLookMode: "ideal", nightPreview: true });
  },
  backToLive: () => {
    const state = get();
    replaceSkyQuery(params => {
      params.delete("sky");
      params.delete("skyUtc");
      params.delete("skyNight");
      if (state.observer.source === "default") clearShanghaiLook(params);
      if (state.destination) params.set("skyPreview", state.destination.id);
    });
    set({ dateOverride: null, timeOffsetMs: 0, nightPreview: false, skyLookMode: "city" });
  },
  timeOffsetMs: 0,
  snapshotDate: null,
  destination: null,
  nightPreview: false,
  detailsOpen: false,
  notice: null,
  toggleDetails: () => set(state => ({ detailsOpen: !state.detailsOpen })),
  randomSky: () => {
    const state = get();
    const date = new Date((state.dateOverride ?? Date.now()) + state.timeOffsetMs);
    const selected = selectRandomSky(date, state.destination?.id);
    if (!selected) {
      set({ notice: 'No destinations are in astronomical night at the displayed time. Try another time.' });
      return;
    }
    ++requestSeq;
    replaceSkyQuery(params => {
      params.set("skyPreview", selected.destination.id);
      params.delete("skyNight");
      params.delete("skyDetails");
      params.delete("skyLook");
      params.delete("bortle");
      params.delete("mag");
      params.delete("lat");
      params.delete("lon");
      if (state.dateOverride !== null) params.set("skyUtc", new Date(state.dateOverride).toISOString());
    });
    set({
      observer: destinationObserver(selected.destination), pollution: destinationPollution(),
      pollutionOverride: null, destination: selected.destination,
      skyLookMode: "city",
      nightPreview: false, detailsOpen: false, notice: null, status: 'custom', preference: 'fudan',
    });
  },
  setSnapshotDate: (timestamp, timeOffsetMs) => {
    const state = get();
    if (state.snapshotDate !== timestamp || (timeOffsetMs !== undefined && state.timeOffsetMs !== timeOffsetMs)) {
      set({ snapshotDate: timestamp, ...(timeOffsetMs !== undefined ? { timeOffsetMs } : {}) });
    }
  },
  setTimeOffset: (timeOffsetMs) => set({ timeOffsetMs }),
  preference: "fudan",
  status: "default",

  initialize: async (query, starsAbove = onStarsAbove()) => {
    const params = new URLSearchParams(query);
    const idealScope = starsAbove && hasShanghaiLook(params);
    if (lastQuery === query && lastIdealScope === idealScope) return;
    const firstVisit = lastQuery === null;
    const leavingPreview = lastQuery !== null && readSkyPreview(lastQuery) !== null;
    lastQuery = query;
    lastIdealScope = idealScope;
    const overrides = readOverrides(query);
    const preview = readSkyPreview(query);
    const idealLink = starsAbove && isIdealSkyLink(params);
    const idealMode = starsAbove && params.get("skyLook") === "ideal";
    const offset = get().timeOffsetMs;
    if (preview?.kind === 'random') {
      set({ dateOverride: overrides.date?.getTime() ?? null,
        skyLookMode: "city", nightPreview: false });
      get().randomSky();
      set({ detailsOpen: preview.details });
      return;
    }
    if (preview?.kind === 'destination') {
      const date = preview.night
        ? findNightPreviewTime(preview.destination, new Date((overrides.date?.getTime() ?? Date.now()) + offset))
        : overrides.date;
      if (preview.night && !date) {
        set({ notice: 'A night preview is unavailable for this date.' });
        return;
      }
      ++requestSeq;
      set({ observer: destinationObserver(preview.destination), pollution: destinationPollution(),
        pollutionOverride: null,
        dateOverride: date ? date.getTime() - (preview.night ? offset : 0) : null, skyLookMode: "city",
        destination: preview.destination, nightPreview: preview.night,
        detailsOpen: preview.details, notice: null, preference: 'fudan', status: 'custom' });
      return;
    }
    if (preview?.kind === 'fudan' || (!overrides.observer && (idealLink || idealMode))) {
      const seq = ++requestSeq;
      const observer = defaultObserver();
      const pollutionOverride = idealLink ? null : overrides.pollution ?? null;
      const skyLookMode = idealLink || idealMode ? "ideal" : "city";
      const dateOverride = overrides.date?.getTime() ?? null;
      lastUrlObserver = undefined;
      set({ observer, pollution: pollutionOverride ?? FUDAN_FALLBACK, pollutionOverride,
        dateOverride, skyLookMode,
        destination: null, nightPreview: false, detailsOpen: preview?.details ?? get().detailsOpen,
        notice: null, preference: 'fudan', status: 'default' });
      const pollution = pollutionOverride ?? await getLightPollution(observer.latitude, observer.longitude);
      if (seq === requestSeq) set({ pollution: get().pollutionOverride ?? pollution });
      return;
    }
    const locationChanged = firstVisit || leavingPreview ||
      lastUrlObserver?.latitude !== overrides.observer?.latitude ||
      lastUrlObserver?.longitude !== overrides.observer?.longitude;
    lastUrlObserver = overrides.observer;

    const preference = firstVisit ? readPreference() : get().preference;
    const currentObserver = get().observer;
    const observer = locationChanged
      ? overrides.observer ??
        (currentObserver.source === "geolocation" && preference === "local"
          ? currentObserver : defaultObserver())
      : currentObserver;
    const pollutionOverride = overrides.pollution ?? null;
    const seq = locationChanged ? ++requestSeq : requestSeq;
    set({
      preference,
      pollutionOverride,
      dateOverride: overrides.date?.getTime() ?? null,
      skyLookMode: "city", nightPreview: false,
      ...(firstVisit ? { observer, pollution: pollutionOverride ?? { ...FUDAN_FALLBACK } } : {}),
      ...(locationChanged ? { status: observer.source === "geolocation" ? "custom" : "default" } : {}),
      ...(locationChanged ? { destination: null, nightPreview: false, detailsOpen: false, notice: null } : {}),
    });

    const pollution = pollutionOverride ??
      (observer.source === 'random' ? destinationPollution() :
        await getLightPollution(observer.latitude, observer.longitude));
    if (seq !== requestSeq) return;
    if (!locationChanged && get().observer !== observer) return;
    set({ observer, pollution: get().pollutionOverride ?? pollution });

    // Restore only an opted-in, already-granted location after the Fudan data loads.
    if (!locationChanged || overrides.observer || observer.source === "geolocation" ||
        preference !== "local" || !navigator.permissions?.query) return;
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (seq !== requestSeq || permission.state !== "granted") return;
      await get().requestMySky();
    } catch {
      // Keep the current sky and the manual entry point.
    }
  },

  requestMySky: async () => {
    if (get().status === "locating") return;
    const seq = ++requestSeq;
    set({ status: "locating" });
    try {
      const location = await requestUserLocation();
      if (seq !== requestSeq) return;
      const observer: ObserverSpec = {
        name: "Your location",
        latitude: location.latitude,
        longitude: location.longitude,
        source: "geolocation",
      };
      const pollution = get().pollutionOverride ??
        await getLightPollution(observer.latitude, observer.longitude);
      if (seq !== requestSeq) return;
      replaceSkyQuery(params => {
        if (get().observer.source === "default") clearShanghaiLook(params);
        params.delete("skyPreview");
        params.delete("skyDetails");
        params.delete("skyNight");
        params.delete("lat");
        params.delete("lon");
        const { dateOverride } = get();
        if (dateOverride !== null) params.set("skyUtc", new Date(dateOverride).toISOString());
      });
      set({ observer, pollution: get().pollutionOverride ?? pollution,
        status: "custom", preference: "local", destination: null,
        skyLookMode: "city", nightPreview: false, detailsOpen: false, notice: null });
      savePreference("local");
    } catch {
      if (seq === requestSeq) set({ status: "error",
        notice: 'Location unavailable. Allow location access and try Use my sky again.' });
    }
  },

  resetSky: async () => {
    if (get().status === "resetting") return;
    const seq = ++requestSeq;
    savePreference("fudan");
    const observer = defaultObserver();
    const state = get();
    replaceSkyQuery(params => {
      params.set("skyPreview", "fudan");
      params.delete("skyDetails");
      params.delete("skyNight");
      params.delete("lat");
      params.delete("lon");
      params.delete("skyLook");
      if (!state.pollutionOverride && isIdealSkyLink(params)) params.delete("bortle");
      if (state.dateOverride !== null) params.set("skyUtc", new Date(state.dateOverride).toISOString());
    });
    set({ observer, preference: "fudan", status: "resetting",
      pollution: get().pollutionOverride ?? { ...FUDAN_FALLBACK },
      destination: null, skyLookMode: "city", nightPreview: false, detailsOpen: false, notice: null });
    const pollution = get().pollutionOverride ??
      await getLightPollution(observer.latitude, observer.longitude);
    if (seq !== requestSeq) return;
    set({ observer, pollution: get().pollutionOverride ?? pollution, status: "default" });
  },
}));
