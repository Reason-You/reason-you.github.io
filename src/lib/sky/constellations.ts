import data from '../../../public/data/constellation-lines.json';
import membership from '../../../public/data/constellation-membership.json';
import type { Camera, ProjectedPoint } from './projection';
import type { RenderedStar } from './renderer';

export const CONSTELLATIONS = data.constellations;
export const CONSTELLATION_ATTRIBUTION = `${data.author}; Stellarium Modern; ${data.license}; ${data.source}; ${data.licenseUrl}; ${data.modifications}`;
export interface ConstellationSegment {
  fromHip: number;
  toHip: number;
  from: ProjectedPoint;
  to: ProjectedPoint;
}

export function readConstellationPreview(value: string | null): 0.08 | 0.12 | null {
  return value === null || value === '0.12' ? 0.12 : value === '0.08' ? 0.08 : null;
}

export function constellationForHip(hip: number | null) {
  return hip === null ? null : CONSTELLATIONS.find(c => c.lines.some(line => line.fromHip === hip || line.toHip === hip)) ?? null;
}

const byId = new Map(CONSTELLATIONS.map(constellation => [constellation.id, constellation]));
const byStarId = new Map<number, typeof CONSTELLATIONS[number]>();
for (const [id, starIds] of Object.entries(membership.constellations)) {
  const constellation = byId.get(id);
  if (constellation) for (const starId of starIds) byStarId.set(starId, constellation);
}

/** HYG membership includes visible stars outside the figure's connecting vertices. */
export function constellationForStarId(id: number | null) {
  return id === null ? null : byStarId.get(id) ?? null;
}

export function toggleConstellationSelection(pinnedIds: number[], constellationIds: string[], starId: number) {
  const removing = pinnedIds.includes(starId);
  const nextIds = removing ? pinnedIds.filter(id => id !== starId) : [...pinnedIds, starId];
  const constellation = constellationForStarId(starId);
  return {
    pinnedIds: nextIds,
    constellationIds: nextIds.length === 0 ? [] :
      !removing && constellation && !constellationIds.includes(constellation.id)
        ? [...constellationIds, constellation.id] : constellationIds,
  };
}

export function constellationHitTargets(rendered: readonly RenderedStar[], camera: Camera): RenderedStar[] {
  const available = new Set(CONSTELLATIONS.filter(c => projectConstellation(c, rendered, camera).length > 0).map(c => c.id));
  return rendered.filter(({ star, point }) => {
    const constellation = constellationForStarId(star.id);
    return constellation && available.has(constellation.id) && star.altitude >= 0 &&
      Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height;
  });
}

/** Endpoints reuse the stars actually drawn by the current snapshot and camera. */
export function projectConstellation(
  constellation: typeof CONSTELLATIONS[number], rendered: readonly RenderedStar[], camera: Camera,
): ConstellationSegment[] {
  const visible = new Map<number, RenderedStar>();
  for (const entry of rendered) {
    const { star, point } = entry;
    if (star.hip === null || star.altitude < 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        point.x < 0 || point.x > camera.width || point.y < 0 || point.y > camera.height) continue;
    const previous = visible.get(star.hip);
    if (!previous || star.mag < previous.star.mag) visible.set(star.hip, entry);
  }
  return constellation.lines.flatMap(line => {
    const from = visible.get(line.fromHip), to = visible.get(line.toHip);
    return from && to ? [{ ...line, from: from.point, to: to.point }] : [];
  });
}
