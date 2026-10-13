import { create } from "zustand";
import { ObserverSpec } from "@/lib/sky/constants";
import {
  FUDAN_FALLBACK,
  LightPollution,
  getLightPollution,
} from "@/lib/sky/lightPollution";
import { defaultObserver, readOverrides, requestUserLocation } from "@/lib/sky/observer";
import type { DarkSkyDestination } from "@/lib/sky/destinations";
import {
  destinationObserver, destinationPollution, findNightPreviewTime, readSkyPreview, selectRandomSky,
} from "@/lib/sky/random-sky";

export type SkyPreference = "fudan" | "local";
export type SkyStatus = "default" | "locating" | "resetting" | "custom" | "error";

export const SKY_PREFERENCE_KEY = "sky-preference";

interface SkyStore {
  observer: ObserverSpec;
  pollution: LightPollution;
  /** ?bortle= / ?mag= wins over the real data. */
  pollutionOverride: LightPollution | null;
  dateOverride: number | null;
  /** Instant of the frame actually drawn on Look Up, published after rendering. */
  snapshotDate: number | null;
  destination: DarkSkyDestination | null;
  nightPreview: boolean;
  detailsOpen: boolean;
  notice: string | null;
  toggleDetails: () => void;
  randomSky: () => void;
  setSnapshotDate: (timestamp: number) => void;
  preference: SkyPreference;
  status: SkyStatus;
  /** Initialise once, then apply changed URL parameters on client navigation. */
  initialize: (query: string) => Promise<void>;
  requestMySky: () => Promise<void>;
  resetSky: () => Promise<void>;
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
let lastUrlObserver: ObserverSpec | undefined;

export const useSkyStore = create<SkyStore>((set, get) => ({
  observer: defaultObserver(),
  pollution: { ...FUDAN_FALLBACK },
  pollutionOverride: null,
  dateOverride: null,
  snapshotDate: null,
  destination: null,
  nightPreview: false,
  detailsOpen: false,
  notice: null,
  toggleDetails: () => set(state => ({ detailsOpen: !state.detailsOpen })),
  randomSky: () => {
    const selected = selectRandomSky(new Date(), get().destination?.id);
    if (!selected) {
      set({ notice: 'No destinations are in astronomical night right now. Try again later.' });
      return;
    }
    ++requestSeq;
    set({
      observer: destinationObserver(selected.destination), pollution: destinationPollution(),
      pollutionOverride: null, dateOverride: null, destination: selected.destination,
      nightPreview: false, detailsOpen: false, notice: null, status: 'custom', preference: 'fudan',
    });
  },
  setSnapshotDate: (timestamp) => {
    if (get().snapshotDate !== timestamp) set({ snapshotDate: timestamp });
  },
  preference: "fudan",
  status: "default",

  initialize: async (query) => {
    if (lastQuery === query) return;
    const firstVisit = lastQuery === null;
    const leavingPreview = lastQuery !== null && readSkyPreview(lastQuery) !== null;
    lastQuery = query;
    const overrides = readOverrides(query);
    const preview = readSkyPreview(query);
    if (preview?.kind === 'random') {
      get().randomSky();
      set({ detailsOpen: preview.details });
      return;
    }
    if (preview?.kind === 'destination') {
      const date = preview.night ? findNightPreviewTime(preview.destination, new Date()) : overrides.date;
      if (preview.night && !date) {
        set({ notice: 'A night preview is unavailable for this date.' });
        return;
      }
      ++requestSeq;
      set({ observer: destinationObserver(preview.destination), pollution: destinationPollution(),
        pollutionOverride: null, dateOverride: date?.getTime() ?? null,
        destination: preview.destination, nightPreview: preview.night,
        detailsOpen: preview.details, notice: null, preference: 'fudan', status: 'custom' });
      return;
    }
    if (preview?.kind === 'fudan') {
      const seq = ++requestSeq;
      const observer = defaultObserver();
      set({ observer, pollution: { ...FUDAN_FALLBACK }, pollutionOverride: null, dateOverride: null,
        destination: null, nightPreview: false, detailsOpen: preview.details,
        notice: null, preference: 'fudan', status: 'default' });
      const pollution = await getLightPollution(observer.latitude, observer.longitude);
      if (seq === requestSeq) set({ pollution });
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
      set({ observer, pollution: get().pollutionOverride ?? pollution,
        status: "custom", preference: "local", destination: null,
        dateOverride: get().destination ? null : get().dateOverride,
        nightPreview: false, detailsOpen: false, notice: null });
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
    set({ observer, preference: "fudan", status: "resetting",
      pollution: get().pollutionOverride ?? { ...FUDAN_FALLBACK },
      dateOverride: get().destination ? null : get().dateOverride,
      destination: null, nightPreview: false, detailsOpen: false, notice: null });
    const pollution = get().pollutionOverride ??
      await getLightPollution(observer.latitude, observer.longitude);
    if (seq !== requestSeq) return;
    set({ observer, pollution: get().pollutionOverride ?? pollution, status: "default" });
  },
}));
