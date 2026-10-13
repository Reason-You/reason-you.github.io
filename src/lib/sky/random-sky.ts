import { Body } from 'astronomy-engine';
import { getBodyAltitude } from './astro';
import { DARK_SKY_ATLAS, DARK_SKY_DESTINATIONS, type DarkSkyDestination } from './destinations';
import type { ObserverSpec } from './constants';
import { limitingMagnitudeForBortle, type LightPollution } from './lightPollution';

export const ASTRONOMICAL_NIGHT_ALTITUDE = -18;

export function destinationObserver(destination: DarkSkyDestination): ObserverSpec {
  return { name: destination.englishName, latitude: destination.latitude,
    longitude: destination.longitude, source: 'random' };
}

export function destinationPollution(): LightPollution {
  return {
    limitingMagnitude: limitingMagnitudeForBortle(DARK_SKY_ATLAS.bortleApprox),
    bortleApprox: DARK_SKY_ATLAS.bortleApprox,
    lightProxy: Number.NaN,
    source: 'atlas-2025',
    datasetYear: DARK_SKY_ATLAS.year,
  };
}

export interface NightDestination {
  destination: DarkSkyDestination;
  sunAltitude: number;
  moonAltitude: number;
}

export function nightDestinations(date: Date, destinations = DARK_SKY_DESTINATIONS): NightDestination[] {
  return destinations.flatMap(destination => {
    const sunAltitude = getBodyAltitude(Body.Sun, date, destination);
    if (sunAltitude >= ASTRONOMICAL_NIGHT_ALTITUDE) return [];
    return [{ destination, sunAltitude, moonAltitude: getBodyAltitude(Body.Moon, date, destination) }];
  });
}

/** Evaluate every site at the same real instant; avoid repeats before preferring moonless skies. */
export function selectRandomSky(
  date: Date, previousId?: string, random: () => number = Math.random,
  destinations = DARK_SKY_DESTINATIONS,
): NightDestination | null {
  const eligible = nightDestinations(date, destinations);
  const different = eligible.filter(site => site.destination.id !== previousId);
  const alternatives = different.length ? different : eligible;
  const moonless = alternatives.filter(site => site.moonAltitude < 0);
  const pool = moonless.length ? moonless : alternatives;
  return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

/** A repeatable, genuinely dark instant within the reference UTC calendar day. */
export function findNightPreviewTime(destination: DarkSkyDestination, reference: Date): Date | null {
  const midnight = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  let darkest = ASTRONOMICAL_NIGHT_ALTITUDE;
  let selected: Date | null = null;
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    const date = new Date(midnight + minutes * 60_000);
    const altitude = getBodyAltitude(Body.Sun, date, destination);
    if (altitude < darkest) {
      darkest = altitude;
      selected = date;
    }
  }
  return selected;
}

export type SkyPreview =
  | { kind: 'fudan' | 'random'; details: boolean }
  | { kind: 'destination'; destination: DarkSkyDestination; night: boolean; details: boolean };

export function readSkyPreview(query: string): SkyPreview | null {
  const params = new URLSearchParams(query);
  const id = params.get('skyPreview');
  const details = params.get('skyDetails') === '1';
  if (id === 'fudan' || id === 'random') return { kind: id, details };
  const destination = DARK_SKY_DESTINATIONS.find(site => site.id === id);
  return destination ? { kind: 'destination', destination, night: params.get('skyNight') === '1', details } : null;
}
