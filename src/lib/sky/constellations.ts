import data from '../../../public/data/constellation-lines.json';
import membership from '../../../public/data/constellation-membership.json';
import vertices from '../../../public/data/constellation-vertices.json';
import type { Camera, ProjectedPoint } from './projection';
import { projectSkySegment } from './projection';
import type { RenderedStar } from './renderer';
import type { SkyStar } from './astro';

export const CONSTELLATIONS = data.constellations;
export const CONSTELLATION_VERTICES = vertices.vertices;
export const CONSTELLATION_ATTRIBUTION = `${data.author}; Stellarium Modern; ${data.license}; ${data.source}; ${data.licenseUrl}; ${data.modifications}; Vertex coordinates: ${vertices.author}; HYG ${vertices.version}; ${vertices.license}; ${vertices.source}`;
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

export function selectConstellationLabel(hoveredId: string | null, pinnedIds: readonly number[],
  constellationIds: readonly string[], visibleIds: readonly string[]): string | null {
  const visible = new Set(visibleIds);
  if (hoveredId && visible.has(hoveredId)) return hoveredId;
  for (const id of [...pinnedIds].reverse()) {
    const constellation = constellationForStarId(id);
    if (constellation && visible.has(constellation.id)) return constellation.id;
  }
  return [...constellationIds].reverse().find(id => visible.has(id)) ?? null;
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

export function constellationHitTargets(rendered: readonly RenderedStar[], stars: readonly SkyStar[], camera: Camera): RenderedStar[] {
  const available = new Set(CONSTELLATIONS.filter(c => projectConstellation(c, stars, camera).length > 0).map(c => c.id));
  return rendered.filter(({ star, point }) => {
    const constellation = constellationForStarId(star.id);
    return constellation && available.has(constellation.id) && star.altitude >= 0 &&
      Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height;
  });
}

/** Complete source vertices share the star camera; visible portions survive clipping. */
export function projectConstellation(
  constellation: typeof CONSTELLATIONS[number], stars: readonly SkyStar[], camera: Camera,
): ConstellationSegment[] {
  const byHip = new Map(stars.map(star => [star.hip, star]));
  return constellation.lines.flatMap(line => {
    const from = byHip.get(line.fromHip), to = byHip.get(line.toHip);
    const segment = from && to ? projectSkySegment(from, to, camera) : null;
    return segment ? [{ ...line, ...segment }] : [];
  });
}
