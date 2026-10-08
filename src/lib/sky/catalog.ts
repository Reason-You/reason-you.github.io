import { STAR_DATA } from "./catalog-data";

export interface Star {
  /** Right ascension in sidereal hours (J2000). */
  ra: number;
  /** Declination in degrees (J2000). */
  dec: number;
  /** Visual magnitude. */
  mag: number;
  /** B-V colour index, when known. */
  colorIndex?: number;
  /** Proper name, when known (not rendered by default). */
  name?: string;
}

let cachedCatalog: Star[] | null = null;

/** Materialise the compact tuple catalog into readable objects (cached). */
export function getCatalog(): Star[] {
  if (cachedCatalog) return cachedCatalog;
  cachedCatalog = STAR_DATA.map(([ra, dec, mag, colorIndex, name]) => ({
    ra,
    dec,
    mag,
    colorIndex: colorIndex === null ? undefined : colorIndex,
    name: name || undefined,
  }));
  return cachedCatalog;
}

/** Stars at or brighter than `limitingMagnitude`, sorted brightest first. */
export function visibleStars(limitingMagnitude: number): Star[] {
  return getCatalog().filter((star) => star.mag <= limitingMagnitude);
}
