import { MOBILE_BREAKPOINT_PX, SKY_VIEW } from './constants';
import { Camera, createCamera } from './projection';
import { RenderedStar } from './renderer';
import { VERIFIED_STAR_NAMES, VerifiedStarName } from './star-names';

const DEG = Math.PI / 180;
export const LOOK_UP_VERTICAL_FOV = 75;
export const LOOK_UP_HIT_RADIUS = { mouse: 16, touch: 28 } as const;

export const SKY_DIRECTIONS = {
  south: { name: 'South', azimuth: 180, next: 'west' },
  west: { name: 'West', azimuth: 270, next: 'north' },
  north: { name: 'North', azimuth: 0, next: 'east' },
  east: { name: 'East', azimuth: 90, next: 'south' },
} as const;
export type SkyFacing = keyof typeof SKY_DIRECTIONS;
export function readFacing(value: string | null): SkyFacing {
  return value === 'north' || value === 'east' || value === 'west' ? value : 'south';
}

/** A square-pixel perspective: portrait screens set vertical rather than horizontal FOV. */
export function createLookUpCamera(width: number, height: number, facing: SkyFacing = 'south'): Camera {
  const horizontalFov = width < MOBILE_BREAKPOINT_PX
    ? 2 * Math.atan(Math.tan(LOOK_UP_VERTICAL_FOV * DEG / 2) * width / height) / DEG
    : SKY_VIEW.horizontalFov;
  return createCamera(width, height, { ...SKY_VIEW, azimuth: SKY_DIRECTIONS[facing].azimuth, horizontalFov });
}

export interface InteractiveStar extends RenderedStar {
  name: VerifiedStarName;
}

export function interactiveStars(rendered: RenderedStar[], camera: Camera): InteractiveStar[] {
  return rendered.flatMap((entry) => {
    const name = VERIFIED_STAR_NAMES[entry.star.id];
    const { x, y } = entry.point;
    if (entry.star.mag > 3 || !name ||
        x < 0 || x > camera.width || y < 0 || y > camera.height) return [];
    return [{ ...entry, name }];
  });
}

/** Choose the closest centre; unresolved components within 1px favour the brighter star. */
export function hitTestStar<T extends RenderedStar>(
  stars: readonly T[], x: number, y: number, radius: number
): T | null {
  let closest: T | null = null;
  let closestDistance = radius * radius;
  for (const candidate of stars) {
    const distance = (candidate.point.x - x) ** 2 + (candidate.point.y - y) ** 2;
    if (distance > radius * radius) continue;
    if (!closest || distance < closestDistance - 1 ||
        (Math.abs(distance - closestDistance) <= 1 && candidate.star.mag < closest.star.mag)) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

/** Pinned names accumulate: a click toggles one star; the sky update keeps only visible stars. */
export function togglePinnedId(pinnedIds: number[], id: number): number[] {
  return pinnedIds.includes(id) ? pinnedIds.filter((pinned) => pinned !== id) : [...pinnedIds, id];
}

export function reconcilePinnedIds(pinnedIds: number[], available: number[]): number[] {
  return pinnedIds.filter((id) => available.includes(id));
}

/** Keep the measured DOM label inside the sky, on the side with room. */
export function positionStarLabel(
  x: number, y: number, width: number, height: number,
  labelWidth: number, labelHeight: number
): { left: number; top: number } {
  const margin = 12;
  const gap = 18;
  const left = x + gap + labelWidth <= width - margin ? x + gap : x - gap - labelWidth;
  return {
    left: Math.max(margin, Math.min(left, width - labelWidth - margin)),
    top: Math.max(margin, Math.min(y - labelHeight / 2, height - labelHeight - margin)),
  };
}
