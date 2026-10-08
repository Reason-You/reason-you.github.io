import { Body, Equator, Horizon, Observer, Rotation_EQJ_EQD, RotationMatrix } from "astronomy-engine";
import { getCatalog, Star } from "./catalog";
import { ObserverSpec, SKY_DAYTIME_VISIBILITY } from "./constants";
import { LightPollution } from "./lightPollution";

export interface SkyStar extends Star {
  /** Degrees clockwise from north, as seen by the observer. */
  azimuth: number;
  /** Degrees above the horizon (refraction corrected). */
  altitude: number;
}

export interface SkySnapshot {
  /** Instant the snapshot was computed for. */
  date: Date;
  /** Observer used for the computation. */
  observer: ObserverSpec;
  /** Light pollution model in effect. */
  pollution: LightPollution;
  /** Solar altitude in degrees (refraction corrected). */
  sunAltitude: number;
  /**
   * Continuous "how dark is it" factor in [0, 1]:
   * 0 = broad daylight, 1 = astronomical night. Used for the horizon glow.
   */
  twilight: number;
  /**
   * Star visibility for the renderer. Same as `twilight` at night, but never
   * drops below `SKY_DAYTIME_VISIBILITY`, so the real star field stays visible
   * (fainter) in daylight as well.
   */
  visibility: number;
  /** Stars that pass the light-pollution magnitude cut and are above the horizon. */
  stars: SkyStar[];
}

const DEG = Math.PI / 180;
const HOUR = Math.PI / 12;

/** Convert HYG's J2000 coordinates to the true equator and equinox of date. */
function equatorOfDate(ra: number, dec: number, rotation: RotationMatrix): { ra: number; dec: number } {
  const decRad = dec * DEG;
  const raRad = ra * HOUR;
  const cosDec = Math.cos(decRad);
  const x = cosDec * Math.cos(raRad);
  const y = cosDec * Math.sin(raRad);
  const z = Math.sin(decRad);
  const m = rotation.rot;
  const rx = m[0][0] * x + m[1][0] * y + m[2][0] * z;
  const ry = m[0][1] * x + m[1][1] * y + m[2][1] * z;
  const rz = m[0][2] * x + m[1][2] * y + m[2][2] * z;
  const ofDateRa = Math.atan2(ry, rx) / HOUR;

  return {
    ra: ofDateRa < 0 ? ofDateRa + 24 : ofDateRa,
    dec: Math.atan2(rz, Math.hypot(rx, ry)) / DEG,
  };
}

/**
 * Smooth 0..1 ramp between two thresholds (used for twilight).
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Continuous darkness factor from the solar altitude.
 * Sun above the horizon => 0 (stars gone), below -16 deg => full night.
 */
export function twilightFactor(sunAltitude: number): number {
  if (!Number.isFinite(sunAltitude)) return 0;
  if (sunAltitude >= 0) return 0;
  // Civil twilight (0 .. -6) brings out only the brightest stars, so ramp slowly.
  const civil = smoothstep(0, -6, sunAltitude) * 0.35;
  const nautical = smoothstep(-6, -12, sunAltitude) * 0.35;
  const astronomical = smoothstep(-12, -16, sunAltitude) * 0.3;
  return Math.min(1, civil + nautical + astronomical);
}

/**
 * Compute one static snapshot of the sky: sun altitude plus the horizontal
 * coordinates of every catalog star worth drawing.
 *
 * This is the only place that does astronomy; it is intentionally called a few
 * times per hour, never per animation frame.
 */
export function computeSky(
  date: Date,
  observer: ObserverSpec,
  pollution: LightPollution
): SkySnapshot {
  const geoObserver = new Observer(observer.latitude, observer.longitude, 10);

  const sunEquator = Equator(Body.Sun, date, geoObserver, true, true);
  const sunHorizon = Horizon(date, geoObserver, sunEquator.ra, sunEquator.dec, "normal");
  const sunAltitude = sunHorizon.altitude;
  const twilight = twilightFactor(sunAltitude);
  // Daylight keeps a floor so the easter egg is discoverable at any hour.
  const visibility = Math.max(SKY_DAYTIME_VISIBILITY, twilight);

  const rotation = Rotation_EQJ_EQD(date);
  const stars: SkyStar[] = [];
  for (const star of getCatalog()) {
    if (star.mag > pollution.limitingMagnitude) continue;

    const ofDate = equatorOfDate(star.ra, star.dec, rotation);
    const horizon = Horizon(date, geoObserver, ofDate.ra, ofDate.dec, "normal");
    if (horizon.altitude < -2) continue;

    stars.push({
      ...star,
      azimuth: horizon.azimuth,
      altitude: horizon.altitude,
    });
  }

  return {
    date,
    observer,
    pollution,
    sunAltitude,
    twilight,
    visibility,
    stars,
  };
}
