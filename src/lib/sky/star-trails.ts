import { solarSkyState, SkySnapshot, SkyStar } from "./astro";
import { Camera, horizonToVector } from "./projection";
import { colorIndexToRgb, RenderedStar, trailWidthForMagnitude } from "./renderer";

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
export const SPEED_MAX = 3600;
export const SPEED_DOUBLING_MS = 800;

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

interface TrailBucket {
  /** Quantised stroke colour shared by the bucket's segments. */
  color: string;
  width: number;
  /** Flat x1, y1, x2, y2, ... segment coordinates. */
  coords: number[];
  /** Incrementally built in browsers; rebuilt from coords where Path2D is absent. */
  path?: Path2D | null;
}

export interface TrailSlice {
  /** Virtual timestamp of the newest segment in the slice (the age reference). */
  tEnd: number;
  /** Retained brightness after the daylight this slice has experienced. */
  opacity: number;
  /** Sparse array indexed by colourBucket * 3 + widthBucket. */
  buckets: (TrailBucket | undefined)[];
}

const COLOR_SAMPLES = [-0.1, 0.4, 1.2] as const;
/** Segments further apart than this are stars entering or leaving the frame, not motion. */
const JUMP_SQ = 160 * 160;

function colorBucketOf(colorIndex?: number): number {
  const bv = colorIndex ?? 0.4;
  return bv < 0.2 ? 0 : bv < 0.7 ? 1 : 2;
}

function makePath(): Path2D | null {
  return typeof Path2D !== "undefined" ? new Path2D() : null;
}

/**
 * Decaying ring buffer of star-trail slices. Each push connects the rendered
 * stars to their previous positions inside a time-sliced bucket and records
 * each closed slice's fading history. Fresh trails stay bright throughout the
 * day; night keeps accumulating them. draw() restrokes the retained slices.
 */
export class TrailBuffer {
  private ring: TrailSlice[] = [];
  private current: TrailSlice | null = null;
  private currentStart = 0;
  private last = new Map<number, { x: number; y: number }>();

  constructor(
    private sliceSpanMs = 10 * 60 * 1000,
    private maxSlices = 90,
  ) {}

  push(virtualNowMs: number, rendered: RenderedStar[], twilight: number): void {
    if (!this.current) {
      this.current = { tEnd: virtualNowMs, opacity: 1, buckets: [] };
      this.currentStart = virtualNowMs;
    }
    const slice = this.current;
    slice.tEnd = virtualNowMs;
    for (const { star, point } of rendered) {
      const before = this.last.get(star.id);
      this.last.set(star.id, { x: point.x, y: point.y });
      if (!before) continue;
      const dx = point.x - before.x;
      const dy = point.y - before.y;
      if (dx * dx + dy * dy > JUMP_SQ) continue;
      const key = colorBucketOf(star.colorIndex) * 3 + (star.mag < 0.8 ? 0 : star.mag < 2.2 ? 1 : 2);
      let bucket = slice.buckets[key];
      if (!bucket) {
        const [r, g, b] = colorIndexToRgb(COLOR_SAMPLES[Math.floor(key / 3)]);
        bucket = { color: `${r}, ${g}, ${b}`, width: trailWidthForMagnitude(star.mag), coords: [], path: makePath() ?? undefined };
        slice.buckets[key] = bucket;
      }
      bucket.coords.push(before.x, before.y, point.x, point.y);
      bucket.path?.moveTo(before.x, before.y);
      bucket.path?.lineTo(point.x, point.y);
    }
    if (virtualNowMs - this.currentStart >= this.sliceSpanMs) {
      this.ring.push(slice);
      while (this.ring.length > this.maxSlices) this.ring.shift();
      this.current = null;
    }
    this.ring = this.ring.filter(closed => {
      closed.opacity = Math.min(closed.opacity, sliceOpacity(virtualNowMs - closed.tEnd, twilight));
      return closed.opacity > 0;
    });
  }

  draw(
    ctx: CanvasRenderingContext2D,
    style: { isDark: boolean },
  ): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "butt";
    const gain = style.isDark ? 0.85 : 1.8;
    const slices = this.current ? [...this.ring, this.current] : this.ring;
    for (const slice of slices) {
      const opacity = slice.opacity;
      if (opacity <= 0) continue;
      const alpha = Math.min(0.75, gain * opacity).toFixed(3);
      for (const bucket of slice.buckets) {
        if (!bucket) continue;
        if (!bucket.path && bucket.coords.length) {
          const path = makePath();
          for (let i = 0; i < bucket.coords.length; i += 4) {
            path?.moveTo(bucket.coords[i], bucket.coords[i + 1]);
            path?.lineTo(bucket.coords[i + 2], bucket.coords[i + 3]);
          }
          bucket.path = path ?? undefined;
        }
        if (!bucket.path) continue;
        ctx.strokeStyle = `rgba(${bucket.color}, ${alpha})`;
        ctx.lineWidth = bucket.width;
        ctx.stroke(bucket.path);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** Closed slices, oldest first; the in-progress slice is excluded. */
  slices(): readonly TrailSlice[] {
    return this.ring;
  }

  clear(): void {
    this.ring = [];
    this.current = null;
    this.currentStart = 0;
    this.last.clear();
  }
}
