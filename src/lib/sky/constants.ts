/**
 * Sky easter-egg configuration: observer location and view direction.
 *
 * Everything here is pure data / pure functions so it can be reused (and unit tested)
 * without touching the DOM or canvas. The light-pollution model lives in
 * `lightPollution.ts`.
 */

export type ObserverSource = "default" | "geolocation" | "override";

export interface ObserverSpec {
  /** Human readable label, only used for debugging and the "Use my sky" toggle. */
  name: string;
  /** Degrees north of the equator. */
  latitude: number;
  /** Degrees east of the prime meridian. */
  longitude: number;
  source: ObserverSource;
}

/**
 * Default observer: Fudan University, Handan campus (main gate area).
 * Stable campus-centre coordinate, no IP geolocation involved.
 */
export const DEFAULT_OBSERVER: ObserverSpec = {
  name: "Fudan University",
  latitude: 31.2989,
  longitude: 121.5035,
  source: "default",
};

/** The web page is treated as a window facing due south and tilted up a little. */
export const SKY_VIEW = {
  /** Degrees clockwise from north. 180 = due south. */
  azimuth: 180,
  /** Altitude (degrees above horizon) that maps to the vertical centre of the page. */
  centerAltitude: 47.5,
  /** Horizontal field of view in degrees. */
  horizontalFov: 100,
} as const;

/**
 * Where the view centre sits on the canvas (fraction of canvas height).
 * Kept in the upper part so the lower, southern sky still reaches the bottom
 * of the visible window instead of being cropped away.
 */
export const SKY_CENTER_Y = {
  desktop: 0.3,
  mobile: 0.35,
} as const;

/** Recompute the sky every few minutes; no per-frame astronomy. */
export const SKY_UPDATE_INTERVAL_MS = 7 * 60 * 1000;

/**
 * Star visibility never drops to zero: in daylight the real star field is still
 * drawn (at this fraction of full night brightness) so the easter egg is
 * discoverable at any time of day. Sun-altitude twilight logic still applies.
 */
export const SKY_DAYTIME_VISIBILITY = 0.4;

/** Below this width we reduce star count / DPR to stay light on phones. */
export const MOBILE_BREAKPOINT_PX = 640;
