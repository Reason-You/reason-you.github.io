import { solarSkyState, SkySnapshot, SkyStar } from "./astro";
import { Camera, horizonToVector, projectSkyDirection, type ProjectedPoint, type SkyDirectionVector } from "./projection";
import { colorIndexToRgb, trailWidthForMagnitude } from "./renderer";
import { createTrailIndex, createTrailOrbit, createTrailProjector, trailOrbitDirection, type TrailOrbit } from "./trail-geometry";

/**
 * Fast-forward time travel for the Look Up sky.
 *
 * The celestial sphere rotates rigidly about the observer's celestial pole, so
 * advancing time never requires recomputing star positions: rotating the camera
 * about the pole by +theta reprojects every star to its position at the later
 * instant, and rotating the zenith vector gives each star's live altitude, so
 * stars rise in the east and set in the west for any offset. The sun, twilight
 * and visibility are recomputed exactly each frame (~0.02 ms), keeping
 * sunrise, daylight and sunset locked to the real ephemeris. Star trails live
 * in a decaying ring buffer: a comet-tail arc that daylight washes out and the
 * next night rebuilds.
 */

/** One sidereal day in milliseconds (86164.0905 s). */
export const SIDEREAL_DAY_MS = 86164090.5;

/** Hold-to-fast-forward ramp: starts at 60x, doubles every 800 ms, capped. */
export const SPEED_START = 60;
export const SPEED_MAX = 7200;
export const SPEED_DOUBLING_MS = 800;

export const TRAIL_HOLD_MS = 20_000;
export const TRAIL_FADE_MS = 4_000;

/** Trail tail: how much arc daylight keeps before washing it out; night keeps everything. */
export const TRAIL_TAIL_NIGHT_MS = 75 * 60 * 1000;
export const TRAIL_TAIL_DAY_MS = 18 * 60 * 1000;
/** Twilight interval over which new trails develop into full night retention. */
const NIGHT_KEEP_START = 0.6;
const NIGHT_KEEP_END = 0.95;

const DEG = Math.PI / 180;
/** Stars below this (refracted) altitude are dropped, matching computeSky's horizon cut. */
const HORIZON_SIN = Math.sin(-2 * DEG);

type Vec3 = [number, number, number];

/** Celestial pole direction in local ENU coordinates for an observer latitude. */
export function poleAxis(latitudeDeg: number): Vec3 {
  const lat = (latitudeDeg * Math.PI) / 180;
  return [0, Math.cos(lat), Math.sin(lat)];
}

function rotateAbout(v: Vec3, k: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const inv = 1 - cos;
  return [
    v[0] * cos + (k[1] * v[2] - k[2] * v[1]) * sin + k[0] * dot * inv,
    v[1] * cos + (k[2] * v[0] - k[0] * v[2]) * sin + k[1] * dot * inv,
    v[2] * cos + (k[0] * v[1] - k[1] * v[0]) * sin + k[2] * dot * inv,
  ];
}

/**
 * Camera equivalent of advancing `offsetMs` of sidereal time at the observer's
 * latitude. Rotating the camera by +theta about the pole is identical, for the
 * pinhole projection, to rotating every star by -theta, which is exactly the
 * direction the sky drifts as Earth turns.
 */
export function cameraAtOffset(camera: Camera, latitudeDeg: number, offsetMs: number): Camera {
  const axis = poleAxis(latitudeDeg);
  const angle = (2 * Math.PI * offsetMs) / SIDEREAL_DAY_MS;
  return {
    ...camera,
    right: rotateAbout(camera.right, axis, angle),
    up: rotateAbout(camera.up, axis, angle),
    forward: rotateAbout(camera.forward, axis, angle),
  };
}

/** Zenith direction at t0 + offsetMs: a snapshot star is above the horizon there when v·zenith >= sin(-2°). */
export function zenithAtOffset(latitudeDeg: number, offsetMs: number): Vec3 {
  return rotateAbout([0, 0, 1], poleAxis(latitudeDeg), (2 * Math.PI * offsetMs) / SIDEREAL_DAY_MS);
}

export interface VirtualSkyFrame {
  /** Snapshot advanced to base.date + offsetMs: live sun/twilight/visibility and the currently-visible star subset. */
  snapshot: SkySnapshot;
  /** Base camera rotated by the same offset, projecting the base star positions to the advanced instant. */
  camera: Camera;
}

/**
 * Rigidly advance a snapshot by `offsetMs`. Stars keep their stored positions;
 * the camera and the horizon test rotate about the celestial pole, so eastern
 * stars rise and western stars set for offsets of any length. The sun, twilight
 * and visibility are recomputed exactly for the advanced instant at the
 * observer's location, so fast-forwarding crosses sunrise, daylight and sunset
 * in sync with the real ephemeris, however many hours or days it spans.
 */
export function snapshotAtOffset(
  base: SkySnapshot,
  baseCamera: Camera,
  offsetMs: number,
): VirtualSkyFrame {
  if (offsetMs === 0) return { snapshot: base, camera: baseCamera };
  const latitude = base.observer.latitude;
  const camera = cameraAtOffset(baseCamera, latitude, offsetMs);
  const date = new Date(base.date.getTime() + offsetMs);
  const { sunAltitude, twilight, visibility } = solarSkyState(date, base.observer);
  const zenith = zenithAtOffset(latitude, offsetMs);
  const stars: SkyStar[] = [];
  for (const star of base.celestialStars) {
    const v = horizonToVector(star.altitude, star.azimuth);
    if (v[0] * zenith[0] + v[1] * zenith[1] + v[2] * zenith[2] < HORIZON_SIN) continue;
    stars.push(star);
  }
  return { snapshot: { ...base, date, sunAltitude, twilight, visibility, stars }, camera };
}

/** Instantaneous fast-forward multiplier after holding for `holdMs`. */
export function speedMultiplier(holdMs: number): number {
  if (holdMs <= 0) return SPEED_START;
  return Math.min(SPEED_MAX, SPEED_START * Math.pow(2, holdMs / SPEED_DOUBLING_MS));
}

/**
 * Virtual sky time elapsed after holding for `holdMs`: the closed-form
 * integral of the speed ramp, so the exposure is frame-rate independent.
 */
export function virtualElapsedMs(holdMs: number): number {
  if (holdMs <= 0) return 0;
  const rampToMaxMs = SPEED_DOUBLING_MS * Math.log2(SPEED_MAX / SPEED_START);
  const rampFactor = (SPEED_START * SPEED_DOUBLING_MS) / Math.LN2;
  if (holdMs <= rampToMaxMs) {
    return rampFactor * (Math.pow(2, holdMs / SPEED_DOUBLING_MS) - 1);
  }
  return rampFactor * (SPEED_MAX / SPEED_START - 1) + SPEED_MAX * (holdMs - rampToMaxMs);
}

/** Compact time offset for the pill: "+38m", "+2h 14m", "+1d 3h". */
export function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? "\u2212" : "+";
  const minutes = Math.round(Math.abs(offsetMs) / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return mins ? `${sign}${days}d ${hours}h ${mins}m` : `${sign}${days}d ${hours}h`;
  if (hours > 0) return mins ? `${sign}${hours}h ${mins}m` : `${sign}${hours}h`;
  return `${sign}${mins}m`;
}

/** Visible trail length: daylight washes trails out far faster than night rebuilds them. */
export function trailTailMs(twilight: number): number {
  const t = Math.min(1, Math.max(0, twilight));
  return TRAIL_TAIL_DAY_MS + (TRAIL_TAIL_NIGHT_MS - TRAIL_TAIL_DAY_MS) * t;
}

/** Continuous retention target: a fresh head, a daylight tail and full night accumulation. */
export function sliceOpacity(ageMs: number, twilight: number): number {
  const progress = Math.min(1, Math.max(0, (twilight - NIGHT_KEEP_START) / (NIGHT_KEEP_END - NIGHT_KEEP_START)));
  const nightKeep = progress * progress * (3 - 2 * progress);
  const remaining = Math.max(0, 1 - ageMs / trailTailMs(twilight));
  return Math.max(Math.pow(remaining, 1.5), nightKeep);
}

export interface TrailSlice {
  /** The actual exposed interval in virtual UTC milliseconds. */
  tStart: number;
  tEnd: number;
  /** Retained brightness after the daylight this slice has experienced. */
  opacity: number;
}

interface TrailStyle {
  color: string;
  width: number;
}

interface PaintedSlice {
  tPainted: number;
  paths: (Path2D | undefined)[];
  emitters: ((x1: number, y1: number, x2: number, y2: number, connected?: boolean) => void)[];
  graded?: { tEnd: number; trails: GradedTrail[] };
}

interface GradedTrail {
  path: Path2D;
  bucket: number;
  from: ProjectedPoint | null;
  to: ProjectedPoint | null;
}

const COLOR_SAMPLES = [-0.1, 0.4, 1.2] as const;

function colorBucketOf(colorIndex?: number): number {
  const bv = colorIndex ?? 0.4;
  return bv < 0.2 ? 0 : bv < 0.7 ? 1 : 2;
}

function sameProjection(a: Camera, b: Camera): boolean {
  return a === b || (a.width === b.width && a.height === b.height && a.scale === b.scale &&
    a.centerYFraction === b.centerYFraction &&
    a.right.every((value, i) => value === b.right[i]) &&
    a.up.every((value, i) => value === b.up[i]) &&
    a.forward.every((value, i) => value === b.forward[i]));
}

/** Full-sky exposure intervals with irreversible daylight fading and view-local path caches. */
export class TrailBuffer {
  private ring: TrailSlice[] = [];
  private current: TrailSlice | null = null;
  private currentStart = 0;
  private lastTime: number | null = null;
  private epochMs = 0;
  private stars: { id: number; orbit: TrailOrbit; bucket: number; uniqueTrail: boolean }[] = [];
  private orbits: TrailOrbit[] = [];
  private styles: (TrailStyle | undefined)[] = [];
  private targetCamera: Camera | null = null;
  private projector: ReturnType<typeof createTrailProjector> | null = null;
  private painted = new Map<TrailSlice, PaintedSlice>();
  private worldIndices = new Map<TrailSlice, ReadonlyMap<number, Uint32Array>>();

  constructor(
    private sliceSpanMs = 10 * 60 * 1000,
    private maxSlices = 90,
  ) {}

  begin(snapshot: SkySnapshot, startTimeMs: number): void {
    this.clear();
    this.epochMs = snapshot.date.getTime();
    this.currentStart = startTimeMs;
    this.lastTime = startTimeMs;
    const pole = poleAxis(snapshot.observer.latitude);
    const coincident = new Map<number, Map<number, number>>();
    this.stars = snapshot.celestialStars.map(star => {
      const bucket = colorBucketOf(star.colorIndex) * 3 + (star.mag < 0.8 ? 0 : star.mag < 2.2 ? 1 : 2);
      let azimuths = coincident.get(star.altitude);
      if (!azimuths) { azimuths = new Map(); coincident.set(star.altitude, azimuths); }
      const styles = azimuths.get(star.azimuth) ?? 0;
      const uniqueTrail = (styles & (1 << bucket)) === 0;
      azimuths.set(star.azimuth, styles | (1 << bucket));
      if (!this.styles[bucket]) {
        const [r, g, b] = colorIndexToRgb(COLOR_SAMPLES[Math.floor(bucket / 3)]);
        this.styles[bucket] = { color: `${r}, ${g}, ${b}`, width: trailWidthForMagnitude(star.mag) };
      }
      return { id: star.id, orbit: createTrailOrbit(horizonToVector(star.altitude, star.azimuth), pole), bucket, uniqueTrail };
    });
    this.orbits = this.stars.map(star => star.orbit);
  }

  push(virtualNowMs: number, twilight: number): void {
    if (this.lastTime === null || virtualNowMs <= this.lastTime) return;
    let fromTime = this.lastTime;
    while (fromTime < virtualNowMs) {
      if (!this.current) this.current = { tStart: fromTime, tEnd: fromTime, opacity: 1 };
      const slice = this.current;
      const boundary = this.currentStart + this.sliceSpanMs;
      const toTime = Math.min(virtualNowMs, boundary);
      slice.tEnd = toTime;
      this.worldIndices.delete(slice);
      if (toTime === boundary) {
        this.ring.push(slice);
        // A complete interval replaces its incremental exposure path once.
        this.painted.delete(slice);
        this.currentStart = boundary;
        this.current = null;
      }
      fromTime = toTime;
    }
    this.lastTime = virtualNowMs;
    const oldestTime = virtualNowMs - this.sliceSpanMs * this.maxSlices;
    this.ring = this.ring.filter(closed => {
      if (closed.tStart < oldestTime) { this.painted.delete(closed); this.worldIndices.delete(closed); return false; }
      closed.opacity = Math.min(closed.opacity, sliceOpacity(virtualNowMs - closed.tEnd, twilight));
      if (closed.opacity <= 0) { this.painted.delete(closed); this.worldIndices.delete(closed); return false; }
      return true;
    });
  }

  private createPaintedSlice(slice: TrailSlice): PaintedSlice {
    const paths: PaintedSlice['paths'] = [];
    const emitters = Array.from({ length: 9 }, (_, bucket) => {
      let path: Path2D | undefined;
      return (x1: number, y1: number, x2: number, y2: number, connected?: boolean) => {
        if (!path) paths[bucket] = path = new Path2D();
        if (!connected) path.moveTo(x1, y1);
        path.lineTo(x2, y2);
      };
    });
    return { tPainted: slice.tStart, paths, emitters };
  }

  private gradedTrails(slice: TrailSlice, painted: PaintedSlice, camera: Camera): GradedTrail[] {
    if (painted.graded?.tEnd === slice.tEnd) return painted.graded.trails;
    const fromAngle = (slice.tStart - this.epochMs) * 2 * Math.PI / SIDEREAL_DAY_MS;
    const toAngle = (slice.tEnd - this.epochMs) * 2 * Math.PI / SIDEREAL_DAY_MS;
    let index = this.worldIndices.get(slice);
    if (!index) {
      index = createTrailIndex(this.orbits, fromAngle, toAngle);
      this.worldIndices.set(slice, index);
    }
    const trails: GradedTrail[] = [];
    const projector = this.projector!;
    for (const cell of projector.visibleCells) {
      const candidates = index.get(cell);
      if (!candidates) continue;
      for (let i = 0; i < candidates.length; i++) {
        const star = this.stars[candidates[i]];
        if (!star.uniqueTrail) continue;
        let path: Path2D | undefined;
        projector.appendCoordinates(star.orbit, fromAngle, toAngle, (x1, y1, x2, y2, connected) => {
          path ??= new Path2D();
          if (!connected) path.moveTo(x1, y1);
          path.lineTo(x2, y2);
        });
        if (!path) continue;
        trails.push({
          path, bucket: star.bucket,
          from: projectSkyDirection(trailOrbitDirection(star.orbit, fromAngle), camera),
          to: projectSkyDirection(trailOrbitDirection(star.orbit, toAngle), camera),
        });
      }
    }
    painted.graded = { tEnd: slice.tEnd, trails };
    return trails;
  }

  draw(ctx: CanvasRenderingContext2D, style: { isDark: boolean; camera: Camera }): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    const gain = style.isDark ? 0.85 : 1.8;
    if (!this.targetCamera || !sameProjection(this.targetCamera, style.camera)) {
      this.targetCamera = style.camera;
      this.projector = createTrailProjector(style.camera);
      this.painted.clear();
    }
    const projector = this.projector!;
    const slices = this.current ? [...this.ring, this.current] : this.ring;
    const alphas = slices.map(slice => Math.min(0.75, gain * slice.opacity));
    for (let n = 0; n < slices.length; n++) {
      const slice = slices[n], alpha = alphas[n];
      if (slice.opacity <= 0 || slice.tEnd <= slice.tStart) continue;
      let painted = this.painted.get(slice);
      if (!painted) { painted = this.createPaintedSlice(slice); this.painted.set(slice, painted); }
      const previous = slices[n - 1], next = slices[n + 1], span = slice.tEnd - slice.tStart;
      const previousSpan = previous ? previous.tEnd - previous.tStart : 0;
      const nextSpan = next ? next.tEnd - next.tStart : 0;
      const left = previous?.tEnd === slice.tStart
        ? (alphas[n - 1] * span + alpha * previousSpan) / (previousSpan + span) : alpha;
      const right = next?.tStart === slice.tEnd
        ? (alpha * nextSpan + alphas[n + 1] * span) / (span + nextSpan) : alpha;
      const centerAlpha = alpha.toFixed(3), leftAlpha = left.toFixed(3), rightAlpha = right.toFixed(3);
      if (leftAlpha !== centerAlpha || rightAlpha !== centerAlpha) {
        const colors = this.styles.map(stroke => stroke ? [
          `rgba(${stroke.color}, ${leftAlpha})`,
          `rgba(${stroke.color}, ${centerAlpha})`,
          `rgba(${stroke.color}, ${rightAlpha})`,
        ] : undefined);
        for (const trail of this.gradedTrails(slice, painted, style.camera)) {
          const stroke = this.styles[trail.bucket]!;
          const color = colors[trail.bucket]!;
          const { from, to } = trail;
          if (from && to && Math.hypot(to.x - from.x, to.y - from.y) > 1e-3) {
            const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
            gradient.addColorStop(0, color[0]);
            gradient.addColorStop(0.5, color[1]);
            gradient.addColorStop(1, color[2]);
            ctx.strokeStyle = gradient;
          } else ctx.strokeStyle = color[1];
          ctx.lineWidth = stroke.width;
          ctx.stroke(trail.path);
        }
        continue;
      }
      if (painted.tPainted < slice.tEnd) {
        const fromAngle = (painted.tPainted - this.epochMs) * 2 * Math.PI / SIDEREAL_DAY_MS;
        const toAngle = (slice.tEnd - this.epochMs) * 2 * Math.PI / SIDEREAL_DAY_MS;
        if (painted.tPainted === slice.tStart) {
          let index = this.worldIndices.get(slice);
          if (!index) { index = createTrailIndex(this.orbits, fromAngle, toAngle); this.worldIndices.set(slice, index); }
          for (const cell of projector.visibleCells) {
            const candidates = index.get(cell);
            if (!candidates) continue;
            for (let i = 0; i < candidates.length; i++) {
              const star = this.stars[candidates[i]];
              projector.appendCoordinates(star.orbit, fromAngle, toAngle, painted.emitters[star.bucket]);
            }
          }
        } else {
          for (let i = 0; i < this.stars.length; i++) {
            const star = this.stars[i];
            projector.appendCoordinates(star.orbit, fromAngle, toAngle, painted.emitters[star.bucket]);
          }
        }
        painted.tPainted = slice.tEnd;
      }
      for (let bucket = 0; bucket < painted.paths.length; bucket++) {
        const path = painted.paths[bucket], stroke = this.styles[bucket];
        if (!path || !stroke) continue;
        ctx.strokeStyle = `rgba(${stroke.color}, ${centerAlpha})`;
        ctx.lineWidth = stroke.width;
        ctx.stroke(path);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** Closed slices, oldest first; the in-progress slice is excluded. */
  slices(): readonly TrailSlice[] {
    return this.ring;
  }

  /** Historical intervals remain exposed even when no arc is in the current view. */
  hasTrails(): boolean {
    return this.stars.length > 0 && (!!this.current && this.current.tEnd > this.current.tStart || this.ring.length > 0);
  }

  /** Physical ENU directions at the final exposure instant, including every sky direction. */
  headDirections(): ReadonlyMap<number, SkyDirectionVector> {
    if (this.lastTime === null) return new Map();
    const angle = (this.lastTime - this.epochMs) * 2 * Math.PI / SIDEREAL_DAY_MS;
    return new Map(this.stars.map(star => [star.id, trailOrbitDirection(star.orbit, angle)]));
  }

  clear(): void {
    this.ring = [];
    this.current = null;
    this.currentStart = 0;
    this.lastTime = null;
    this.epochMs = 0;
    this.stars = [];
    this.orbits = [];
    this.styles = [];
    this.targetCamera = null;
    this.projector = null;
    this.painted.clear();
    this.worldIndices.clear();
  }
}
