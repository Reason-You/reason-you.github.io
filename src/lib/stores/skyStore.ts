import { create } from "zustand";
import { ObserverSpec } from "@/lib/sky/constants";
import {
  FUDAN_FALLBACK,
  LightPollution,
  getLightPollution,
} from "@/lib/sky/lightPollution";
import { defaultObserver, readOverrides, requestUserLocation } from "@/lib/sky/observer";

export type SkyPreference = "fudan" | "local";
export type SkyStatus = "default" | "locating" | "resetting" | "custom" | "error";

export const SKY_PREFERENCE_KEY = "sky-preference";

interface SkyStore {
  observer: ObserverSpec;
  pollution: LightPollution;
  /** ?bortle= / ?mag= wins over the real data. */
  pollutionOverride: LightPollution | null;
  dateOverride: number | null;
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
  preference: "fudan",
  status: "default",

  initialize: async (query) => {
    if (lastQuery === query) return;
    const firstVisit = lastQuery === null;
    lastQuery = query;
    const overrides = readOverrides();
    const locationChanged = firstVisit ||
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
    });

    const pollution = pollutionOverride ??
      await getLightPollution(observer.latitude, observer.longitude);
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
        status: "custom", preference: "local" });
      savePreference("local");
    } catch {
      if (seq === requestSeq) set({ status: "error" });
    }
  },

  resetSky: async () => {
    if (get().status === "resetting") return;
    const seq = ++requestSeq;
    set({ preference: "fudan", status: "resetting" });
    savePreference("fudan");
    const observer = defaultObserver();
    const pollution = get().pollutionOverride ??
      await getLightPollution(observer.latitude, observer.longitude);
    if (seq !== requestSeq) return;
    set({ observer, pollution: get().pollutionOverride ?? pollution, status: "default" });
  },
}));
