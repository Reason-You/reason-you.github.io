import {
  projectSkyDirectionSegment,
  type Camera, type ProjectedPoint, type SkyDirectionVector,
} from './projection';

export interface TrailOrbit {
  center: SkyDirectionVector;
  cosine: SkyDirectionVector;
  sine: SkyDirectionVector;
  radius: number;
  curvature: number;
  projection: CameraOrbit;
}

/** A fixed star's local small circle; positive angles advance sidereal time. */
export function createTrailOrbit(direction: SkyDirectionVector, pole: SkyDirectionVector): TrailOrbit {
  const parallel = direction[0] * pole[0] + direction[1] * pole[1] + direction[2] * pole[2];
  const center: SkyDirectionVector = [pole[0] * parallel, pole[1] * parallel, pole[2] * parallel];
  const cosine: SkyDirectionVector = [direction[0] - center[0], direction[1] - center[1], direction[2] - center[2]];
  const radius = Math.hypot(...cosine);
  return {
    center, cosine,
    sine: [
      pole[2] * direction[1] - pole[1] * direction[2],
      pole[0] * direction[2] - pole[2] * direction[0],
      pole[1] * direction[0] - pole[0] * direction[1],
    ],
    radius,
    curvature: Math.min(1, 2 * Math.abs(parallel) * radius),
    projection: {
      camera: null,
      x0: NaN, xc: NaN, xs: NaN, y0: NaN, yc: NaN, ys: NaN, z0: NaN, zc: NaN, zs: NaN,
    },
  };
}

interface AngleSample { cosine: number; sine: number }

function sampledDirection(orbit: TrailOrbit, sample: AngleSample): SkyDirectionVector {
  return [
    orbit.center[0] + orbit.cosine[0] * sample.cosine + orbit.sine[0] * sample.sine,
    orbit.center[1] + orbit.cosine[1] * sample.cosine + orbit.sine[1] * sample.sine,
    orbit.center[2] + orbit.cosine[2] * sample.cosine + orbit.sine[2] * sample.sine,
  ];
}

export function trailOrbitDirection(orbit: TrailOrbit, angleRad: number): SkyDirectionVector {
  return sampledDirection(orbit, { cosine: Math.cos(angleRad), sine: Math.sin(angleRad) });
}

export interface TrailProjector {
  readonly visibleCells: readonly number[];
  appendCoordinates(orbit: TrailOrbit, fromAngle: number, toAngle: number,
    emit: (x1: number, y1: number, x2: number, y2: number, connected?: boolean) => void): void;
  append(orbit: TrailOrbit, fromAngle: number, toAngle: number,
    emit: (from: ProjectedPoint, to: ProjectedPoint, connected?: boolean) => void): void;
}

const MAX_INTERVAL_ANGLE = 2 * Math.PI * (600_000 / 86_164_090.5);
const PIXEL_ERROR = 0.18;
const GRID_SIZE = 8;
const GRID_CELLS = GRID_SIZE ** 3;
const CELL_WIDTH = 2 / GRID_SIZE;
const MAX_ORBIT_SWEEP = 2 * Math.sin(MAX_INTERVAL_ANGLE / 4);

function cellCoordinate(value: number): number {
  return Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((value + 1) / CELL_WIDTH)));
}

/** Midpoint cells for a shared orbit interval of at most ten simulated minutes. */
export function createTrailIndex(
  orbits: readonly TrailOrbit[], fromAngle: number, toAngle: number,
): ReadonlyMap<number, Uint32Array> {
  const cosine = Math.cos((fromAngle + toAngle) / 2), sine = Math.sin((fromAngle + toAngle) / 2);
  const cellIds = new Uint16Array(orbits.length), counts = new Uint32Array(GRID_CELLS);
  for (let i = 0; i < orbits.length; i++) {
    const orbit = orbits[i];
    const x = cellCoordinate(orbit.center[0] + orbit.cosine[0] * cosine + orbit.sine[0] * sine);
    const y = cellCoordinate(orbit.center[1] + orbit.cosine[1] * cosine + orbit.sine[1] * sine);
    const z = cellCoordinate(orbit.center[2] + orbit.cosine[2] * cosine + orbit.sine[2] * sine);
    const cell = (x * GRID_SIZE + y) * GRID_SIZE + z;
    cellIds[i] = cell; counts[cell]++;
  }
  const result = new Map<number, Uint32Array>();
  const byCell: (Uint32Array | undefined)[] = new Array(GRID_CELLS);
  const members = new Uint32Array(orbits.length);
  let offset = 0;
  for (let cell = 0; cell < GRID_CELLS; cell++) if (counts[cell]) {
    const indices = members.subarray(offset, offset + counts[cell]);
    byCell[cell] = indices; result.set(cell, indices);
    offset += counts[cell];
  }
  counts.fill(0);
  for (let i = 0; i < orbits.length; i++) {
    const cell = cellIds[i];
    byCell[cell]![counts[cell]++] = i;
  }
  return result;
}

interface OrbitInterval {
  middle: AngleSample;
  radiusFactor: number;
  samples: AngleSample[];
  errorScale: number;
}

interface CameraOrbit {
  camera: Camera | null;
  x0: number; xc: number; xs: number;
  y0: number; yc: number; ys: number;
  z0: number; zc: number; zs: number;
}

type CompleteCoordinateEmitter = (x1: number, y1: number, x2: number, y2: number,
  connected: boolean, fromDepth: number, toDepth: number) => void;

/** Generate only the visible part of whole-sky exposure circles in one local camera. */
export function createTrailProjector(camera: Camera): TrailProjector {
  const { width, height, scale, centerYFraction, forward, right, up } = camera;
  const halfWidth = width / 2, top = height * centerYFraction, bottom = height - top;
  const horizontalRadius = Math.hypot(halfWidth, scale);
  const topRadius = Math.hypot(top, scale), bottomRadius = Math.hypot(bottom, scale);
  const planes = [
    [0, 0, 1, 0],
    [forward[0], forward[1], forward[2], 0.02],
    [halfWidth * forward[0] + scale * right[0], halfWidth * forward[1] + scale * right[1], halfWidth * forward[2] + scale * right[2], 0],
    [halfWidth * forward[0] - scale * right[0], halfWidth * forward[1] - scale * right[1], halfWidth * forward[2] - scale * right[2], 0],
    [top * forward[0] - scale * up[0], top * forward[1] - scale * up[1], top * forward[2] - scale * up[2], 0],
    [bottom * forward[0] + scale * up[0], bottom * forward[1] + scale * up[1], bottom * forward[2] + scale * up[2], 0],
  ];
  const expandedHalfCell = CELL_WIDTH / 2 + MAX_ORBIT_SWEEP;
  const padding = planes.map(plane => expandedHalfCell * (Math.abs(plane[0]) + Math.abs(plane[1]) + Math.abs(plane[2])));
  const visibleCells: number[] = [];
  for (let cell = 0; cell < GRID_CELLS; cell++) {
    const x = ((cell >> 6) + 0.5) * CELL_WIDTH - 1;
    const y = (((cell >> 3) & 7) + 0.5) * CELL_WIDTH - 1;
    const z = ((cell & 7) + 0.5) * CELL_WIDTH - 1;
    if (planes.every((plane, i) => plane[0] * x + plane[1] * y + plane[2] * z + padding[i] >= plane[3])) visibleCells.push(cell);
  }
  const minimumDepth = Math.max(0.02, 1 / Math.sqrt(1 + (halfWidth / scale) ** 2 + (Math.max(top, bottom) / scale) ** 2));
  // A <=10-minute small circle departs from its great-circle chord by at most angle²/15.
  const safeDepth = minimumDepth - MAX_INTERVAL_ANGLE ** 2 / 15;
  const angleStep = Math.min(MAX_INTERVAL_ANGLE, Math.sqrt(15 * PIXEL_ERROR * safeDepth ** 2 / scale));
  let lastFrom = NaN, lastTo = NaN, lastIntervals: OrbitInterval[] = [];
  const sample = (angle: number): AngleSample => ({ cosine: Math.cos(angle), sine: Math.sin(angle) });
  const prepare = (from: number, to: number): OrbitInterval[] => {
    if (from === lastFrom && to === lastTo) return lastIntervals;
    const prepared: OrbitInterval[] = [];
    const count = Math.max(1, Math.ceil((to - from) / MAX_INTERVAL_ANGLE - 1e-10));
    for (let i = 0; i < count; i++) {
      const start = from + (to - from) * i / count;
      const end = from + (to - from) * (i + 1) / count;
      const steps = 2 ** Math.max(0, Math.ceil(Math.log2((end - start) / angleStep)));
      prepared.push({
        middle: sample((start + end) / 2),
        radiusFactor: 2 * Math.sin((end - start) / 4),
        samples: Array.from({ length: steps + 1 }, (_, index) => sample(start + (end - start) * index / steps)),
        errorScale: scale * (end - start) ** 2 / 15,
      });
    }
    lastFrom = from; lastTo = to; lastIntervals = prepared;
    return prepared;
  };
  const dot = (a: SkyDirectionVector, b: SkyDirectionVector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const appendCoordinates = (orbit: TrailOrbit, fromAngle: number, toAngle: number, emit: CompleteCoordinateEmitter) => {
    if (toAngle <= fromAngle) return;
    const projected = orbit.projection;
    if (projected.camera !== camera) {
      projected.x0 = dot(orbit.center, right); projected.xc = dot(orbit.cosine, right); projected.xs = dot(orbit.sine, right);
      projected.y0 = dot(orbit.center, up); projected.yc = dot(orbit.cosine, up); projected.ys = dot(orbit.sine, up);
      projected.z0 = dot(orbit.center, forward); projected.zc = dot(orbit.cosine, forward); projected.zs = dot(orbit.sine, forward);
      projected.camera = camera;
    }
    const { x0, xc, xs, y0, yc, ys, z0, zc, zs } = projected;
    const local0 = orbit.center[2], localC = orbit.cosine[2], localS = orbit.sine[2];
    let lastX = NaN, lastY = NaN;
    const prepared = fromAngle === lastFrom && toAngle === lastTo ? lastIntervals : prepare(fromAngle, toAngle);
    for (const interval of prepared) {
      const { middle } = interval;
      const zenith = local0 + localC * middle.cosine + localS * middle.sine;
      const radius = orbit.radius * interval.radiusFactor;
      if (zenith + radius < 0) { lastX = NaN; lastY = NaN; continue; }
      const depth = z0 + zc * middle.cosine + zs * middle.sine;
      if (depth + radius < 0.02) { lastX = NaN; lastY = NaN; continue; }
      const x = x0 + xc * middle.cosine + xs * middle.sine;
      if (halfWidth * depth + scale * x + horizontalRadius * radius < 0 ||
          halfWidth * depth - scale * x + horizontalRadius * radius < 0) { lastX = NaN; lastY = NaN; continue; }
      const y = y0 + yc * middle.cosine + ys * middle.sine;
      if (top * depth - scale * y + topRadius * radius < 0 ||
          bottom * depth + scale * y + bottomRadius * radius < 0) { lastX = NaN; lastY = NaN; continue; }
      const depthBound = Math.max(safeDepth, depth - radius);
      const tolerance = PIXEL_ERROR * depthBound ** 2;
      const error = interval.errorScale * orbit.curvature;
      const maximumSteps = interval.samples.length - 1;
      let steps = 1;
      while (steps < maximumSteps && error > tolerance * steps ** 2) steps *= 2;
      const stride = maximumSteps / steps;
      let previousSample = interval.samples[0];
      let previousDepth = z0 + zc * previousSample.cosine + zs * previousSample.sine;
      let factor = previousDepth > 0.02 ? scale / previousDepth : NaN;
      let previousX = halfWidth + (x0 + xc * previousSample.cosine + xs * previousSample.sine) * factor;
      let previousY = top - (y0 + yc * previousSample.cosine + ys * previousSample.sine) * factor;
      let previousInside = local0 + localC * previousSample.cosine + localS * previousSample.sine >= 0 &&
        previousX >= 0 && previousX <= width && previousY >= 0 && previousY <= height;
      for (let i = stride; i < interval.samples.length; i += stride) {
        const current = interval.samples[i];
        const currentDepth = z0 + zc * current.cosine + zs * current.sine;
        factor = currentDepth > 0.02 ? scale / currentDepth : NaN;
        const currentX = halfWidth + (x0 + xc * current.cosine + xs * current.sine) * factor;
        const currentY = top - (y0 + yc * current.cosine + ys * current.sine) * factor;
        const currentInside = local0 + localC * current.cosine + localS * current.sine >= 0 &&
          currentX >= 0 && currentX <= width && currentY >= 0 && currentY <= height;
        let x1 = previousX, y1 = previousY, x2 = currentX, y2 = currentY;
        let fromDepth = previousDepth, toDepth = currentDepth;
        let visible = previousInside && currentInside;
        if (!(previousInside && currentInside)) {
          const clipped = projectSkyDirectionSegment(sampledDirection(orbit, previousSample), sampledDirection(orbit, current), camera);
          if (clipped) {
            x1 = clipped.from.x; y1 = clipped.from.y; x2 = clipped.to.x; y2 = clipped.to.y;
            fromDepth = clipped.from.depth; toDepth = clipped.to.depth; visible = true;
          }
        }
        if (visible) {
          emit(x1, y1, x2, y2, Math.abs(lastX - x1) <= 1e-8 && Math.abs(lastY - y1) <= 1e-8, fromDepth, toDepth);
          lastX = x2; lastY = y2;
        } else { lastX = NaN; lastY = NaN; }
        previousSample = current; previousDepth = currentDepth;
        previousX = currentX; previousY = currentY; previousInside = currentInside;
      }
    }
  };
  return {
    visibleCells,
    appendCoordinates,
    append(orbit, fromAngle, toAngle, emit) {
      appendCoordinates(orbit, fromAngle, toAngle, (x1, y1, x2, y2, connected, fromDepth, toDepth) =>
        emit({ x: x1, y: y1, depth: fromDepth }, { x: x2, y: y2, depth: toDepth }, connected));
    },
  };
}
