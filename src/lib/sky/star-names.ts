import names from './star-names-data.json';

export interface VerifiedStarName {
  english: string;
  chinese: string;
}

/** Verified against Bayer/component identities; see docs/sky-star-names.md. */
export const VERIFIED_STAR_NAMES: Readonly<Record<number, VerifiedStarName>> = Object.fromEntries(
  names.map(({ hygId, english, chinese }) => [hygId, { english, chinese }])
);
