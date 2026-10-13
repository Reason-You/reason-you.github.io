import { MOBILE_BREAKPOINT_PX, SKY_VIEW } from './constants';
import { Camera, createCamera } from './projection';
import { RenderedStar } from './renderer';
import { VERIFIED_STAR_NAMES, VerifiedStarName } from './star-names';
import { rectsOverlap, type LabelRect } from './constellation-label';

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

export interface MeasuredStarLabel {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface StarLabelPosition { left: number; top: number }
export const STAR_LABEL_GAP = 10;

/** Lay out measured names together, keeping existing positions when they still fit. */
export function positionStarLabels(
  labels: readonly MeasuredStarLabel[], width: number, height: number,
  obstacles: readonly LabelRect[] = [], previous: ReadonlyMap<number, StarLabelPosition> = new Map(),
): Map<number, StarLabelPosition> {
  const positions = new Map<number, StarLabelPosition>();
  const occupied = [...obstacles];
  const anchors = labels.map(label => ({ x: label.x - 3, y: label.y - 3, width: 6, height: 6 }));
  for (const label of labels) {
    const { x, y, width: labelWidth, height: labelHeight } = label;
    const valid = ({ left, top }: StarLabelPosition) => {
      const rect = { x: left, y: top, width: labelWidth, height: labelHeight };
      return left >= 12 && top >= 12 && left + labelWidth <= width - 12 && top + labelHeight <= height - 12 &&
        occupied.every(obstacle => !rectsOverlap(rect, obstacle, STAR_LABEL_GAP)) &&
        anchors.every(anchor => !rectsOverlap(rect, anchor, 2));
    };
    const preferred = positionStarLabel(x, y, width, height, labelWidth, labelHeight);
    const old = previous.get(label.id);
    let position = old && Math.hypot(old.left + labelWidth / 2 - x, old.top + labelHeight / 2 - y) <= 120 && valid(old)
      ? old : valid(preferred) ? preferred : undefined;
    const lefts = [preferred.left, x - 18 - labelWidth, x - labelWidth / 2, x + 18]
      .map(left => Math.max(12, Math.min(left, width - labelWidth - 12)));
    for (let row = 0; !position && row <= Math.ceil(height / (labelHeight + STAR_LABEL_GAP)); row++) {
      for (const offset of row === 0 ? [0] : [-row, row]) {
        const top = Math.max(12, Math.min(y - labelHeight / 2 + offset * (labelHeight + STAR_LABEL_GAP), height - labelHeight - 12));
        position = lefts.map(left => ({ left, top })).find(valid);
        if (position) break;
      }
    }
    if (!position) {
      const available: StarLabelPosition[] = [];
      for (let top = 12; top + labelHeight <= height - 12; top += labelHeight + STAR_LABEL_GAP) {
        for (let left = 12; left + labelWidth <= width - 12; left += labelWidth + STAR_LABEL_GAP) {
          if (valid({ left, top })) available.push({ left, top });
        }
      }
      available.sort((a, b) => Math.hypot(a.left + labelWidth / 2 - x, a.top + labelHeight / 2 - y) -
        Math.hypot(b.left + labelWidth / 2 - x, b.top + labelHeight / 2 - y));
      position = available[0];
    }
    if (position) {
      positions.set(label.id, position);
      occupied.push({ x: position.left, y: position.top, width: labelWidth, height: labelHeight });
    }
  }
  return positions;
}
