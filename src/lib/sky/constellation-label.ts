import type { ConstellationSegment } from './constellations';

export interface LabelRect { x: number; y: number; width: number; height: number }
export interface LabelPoint { x: number; y: number }
export const CONSTELLATION_LABEL_GAP = 10;

export function rectsOverlap(a: LabelRect, b: LabelRect, gap = 0): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width > b.x - gap &&
    a.y < b.y + b.height + gap && a.y + a.height > b.y - gap;
}

function closestPoint(point: LabelPoint, from: LabelPoint, to: LabelPoint): LabelPoint {
  const dx = to.x - from.x, dy = to.y - from.y;
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
  return { x: from.x + t * dx, y: from.y + t * dy };
}

function pointToSegment(point: LabelPoint, from: LabelPoint, to: LabelPoint): number {
  const nearest = closestPoint(point, from, to);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

function rectToSegment(rect: LabelRect, from: LabelPoint, to: LabelPoint): number {
  if (crosses(rect, from, to)) return 0;
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height }, { x: rect.x + rect.width, y: rect.y + rect.height }];
  return Math.min(...corners.map(p => pointToSegment(p, from, to)),
    ...[from, to].map(p => Math.hypot(p.x - Math.max(rect.x, Math.min(rect.x + rect.width, p.x)),
      p.y - Math.max(rect.y, Math.min(rect.y + rect.height, p.y)))));
}

/** Slab intersection also counts a line passing through the label between its endpoints. */
function crosses(rect: LabelRect, from: LabelPoint, to: LabelPoint): boolean {
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, rect.x, rect.x + rect.width],
    [from.y, to.y - from.y, rect.y, rect.y + rect.height],
  ]) {
    if (delta === 0) { if (start < min || start > max) return false; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    if (low > high) return false;
  }
  return true;
}

/** Measured rectangles are authoritative; no feasible position means no label. */
export function placeConstellationLabel({ segments, size, viewport, obstacles, previous, anchor }: {
  segments: readonly ConstellationSegment[];
  size: { width: number; height: number };
  viewport: LabelRect;
  obstacles: readonly LabelRect[];
  previous?: LabelPoint | null;
  anchor?: LabelPoint | null;
}): LabelPoint | null {
  if (!segments.length || size.width <= 0 || size.height <= 0) return null;
  let weight = 0, cx = 0, cy = 0;
  const points: LabelPoint[] = [];
  for (const { from, to } of segments) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    cx += (from.x + to.x) / 2 * length; cy += (from.y + to.y) / 2 * length;
    weight += length; points.push(from, to);
  }
  if (weight === 0) return null;
  const center = { x: cx / weight, y: cy / weight };
  const reference = anchor ?? center;
  const nearby = [...segments].sort((a, b) => pointToSegment(reference, a.from, a.to) - pointToSegment(reference, b.from, b.to));
  const focus = anchor ?? closestPoint(reference, nearby[0].from, nearby[0].to);
  const boxCenter = { x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2,
    y: (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2 };
  const valid = (point: LabelPoint) => {
    const rect = { ...point, ...size }, middle = { x: point.x + size.width / 2, y: point.y + size.height / 2 };
    return rect.x >= viewport.x + 12 && rect.y >= viewport.y + 12 &&
      rect.x + rect.width <= viewport.x + viewport.width - 12 &&
      rect.y + rect.height <= viewport.y + viewport.height - 12 &&
      !obstacles.some(obstacle => rectsOverlap(rect, obstacle, CONSTELLATION_LABEL_GAP)) &&
      Math.hypot(middle.x - focus.x, middle.y - focus.y) <= 120 &&
      (segments.some(s => rectToSegment(rect, s.from, s.to) <= 40) ||
        (anchor && rectToSegment(rect, anchor, anchor) <= 40));
  };
  if (previous && valid(previous) && Math.hypot(previous.x + size.width / 2 - focus.x,
    previous.y + size.height / 2 - focus.y) <= 84) return previous;
  const candidates: LabelPoint[] = [];
  const origins = [focus, ...nearby.slice(0, 3).flatMap(s => [s.from, s.to,
    { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }]), center, boxCenter];
  const add = (point: LabelPoint) => {
    candidates.push(point, {
      x: Math.max(viewport.x + 12, Math.min(viewport.x + viewport.width - 12 - size.width, point.x)),
      y: Math.max(viewport.y + 12, Math.min(viewport.y + viewport.height - 12 - size.height, point.y)),
    });
  };
  for (const origin of origins) {
    add({ x: origin.x - size.width / 2, y: origin.y - size.height / 2 });
    for (const radius of [24, 40, 60, 84, 112]) {
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0],[-.707,-.707],[.707,-.707],[-.707,.707],[.707,.707]]) {
        add({ x: origin.x + dx * radius - size.width / 2, y: origin.y + dy * radius - size.height / 2 });
      }
    }
  }
  const feasible = candidates.filter(valid);
  feasible.sort((a, b) => {
    const aRect = { ...a, ...size }, bRect = { ...b, ...size };
    const lineDifference = segments.filter(s => crosses(aRect, s.from, s.to)).length -
      segments.filter(s => crosses(bRect, s.from, s.to)).length;
    return lineDifference * 32 + Math.hypot(a.x + size.width / 2 - focus.x, a.y + size.height / 2 - focus.y) -
      Math.hypot(b.x + size.width / 2 - focus.x, b.y + size.height / 2 - focus.y);
  });
  return feasible[0] ?? null;
}
