import { create } from "zustand";
import { DEFAULT_OBSERVER, ObserverSpec } from "@/lib/sky/constants";
import {
  FUDAN_FALLBACK,
  LightPollution,
  getLightPollution,
} from "@/lib/sky/lightPollution";
import { defaultObserver, readOverrides, requestUserLocation } from "@/lib/sky/observer";

export type SkyStatus = "default" | "locating" | "custom" | "error";

interface SkyStore {
  observer: ObserverSpec;
  /** Effective light pollution for the current observer (real VIIRS data). */
  pollution: LightPollution;
  /** ?bortle= / ?mag= manual override; wins over the real data. */
  pollutionOverride: LightPollution | null;
  /** Fixed instant for testing, as a timestamp. */
  dateOverride: number | null;
  status: SkyStatus;
  /** Read ?sky/?skyUtc/?lat/?lon/?bortle/?mag once, on mount. */
  applyOverrides: () => void;
  /** Resolve the real light pollution for the current observer. */
  loadPollution: () => Promise<void>;
  /** Ask the browser for the visitor's location (only on explicit gesture). */
  requestMySky: () => Promise<void>;
  /** Resolve the default Fudan data, then return to that sky. */
  resetSky: () => Promise<void>;
}

let pollutionRequestSeq = 0;
// URL overrides are read exactly once per page load, so a component remount
// (hot reload, tab discard/restore) can never clobber the state the visitor
// toggled to with "Use my sky".
let overridesApplied = false;

export const useSkyStore = create<SkyStore>((set, get) => ({
  observer: defaultObserver(),
  pollution: { ...FUDAN_FALLBACK },
  pollutionOverride: null,
  dateOverride: null,
  status: "default",

  applyOverrides: () => {
    if (overridesApplied) return;
    overridesApplied = true;
    const overrides = readOverrides();
    if (!overrides.observer && !overrides.pollution && !overrides.date) return;

    if (overrides.observer || overrides.pollution) pollutionRequestSeq += 1;

    set({
      observer: overrides.observer ?? get().observer,
      pollutionOverride: overrides.pollution ?? get().pollutionOverride,
      dateOverride: overrides.date ? overrides.date.getTime() : null,
    });
  },

  loadPollution: async () => {
    const { observer, pollutionOverride } = get();
    const seq = ++pollutionRequestSeq;
    if (pollutionOverride) {
      set({ pollution: pollutionOverride });
      return;
    }

    const pollution = await getLightPollution(observer.latitude, observer.longitude);
    // Ignore stale responses if the observer changed while loading.
    if (seq !== pollutionRequestSeq || get().observer !== observer) return;
    set({ pollution });
  },

  requestMySky: async () => {
    if (get().status === "locating") return;
    const seq = ++pollutionRequestSeq;
    set({ status: "locating" });
    try {
      const location = await requestUserLocation();
      if (seq !== pollutionRequestSeq) return;
      const observer: ObserverSpec = {
        name: "Your location",
        latitude: location.latitude,
        longitude: location.longitude,
        source: "geolocation",
      };
      const pollution = get().pollutionOverride ??
        await getLightPollution(observer.latitude, observer.longitude);
      if (seq !== pollutionRequestSeq) return;
      set({ observer, pollution, status: "custom" });
    } catch {
      // Denied or failed: quietly keep the current sky, no error UI.
      if (seq === pollutionRequestSeq) set({ status: "error" });
    }
  },

  resetSky: async () => {
    const seq = ++pollutionRequestSeq;
    const observer = { ...DEFAULT_OBSERVER };
    const pollution = get().pollutionOverride ??
      await getLightPollution(observer.latitude, observer.longitude);
    if (seq !== pollutionRequestSeq) return;
    set({ observer, pollution, status: "default" });
  },
}));
