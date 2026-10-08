import { SkySnapshot, SkyStar } from "./astro";
import { Camera, project, ProjectedPoint } from "./projection";

export interface RenderStyle {
  /** Effective theme; stars are strongly suppressed on the light theme. */
  isDark: boolean;
  /** Smaller screens keep a slightly taller sky window. */
  mobile: boolean;
  /** The homepage fades its window; Look Up uses the whole camera frame. */
  presentation?: "background" | "look-up";
}

const MIN_MAGNITUDE = -1.5;
const MAX_ALPHA = 0.85;
/** Faintest stars keep a small but visible presence so a dark sky reads as dense. */
const MIN_ALPHA_FRACTION = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smooth01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The sky is a window at the top of the page. These fractions of the canvas
 * height define: fully visible / half faded / gone.
 */
function verticalWindow(mobile: boolean): { f30: number; f45: number; f60: number } {
  return mobile
    ? { f30: 0.35, f45: 0.52, f60: 0.64 }
    : { f30: 0.3, f45: 0.45, f60: 0.6 };
}

/**
 * Vertical sky mask in [0, 1], driven by the star's screen y (top = higher sky).
 * Smooth throughout: no hard cut line.
 */
export function verticalSkyMask(y: number, height: number, mobile: boolean): number {
  const t = clamp(y / height, 0, 1);
  const { f30, f45, f60 } = verticalWindow(mobile);
  if (t <= f30) return 1;
  if (t >= f60) return 0;
  if (t <= f45) return 1 - smooth01((t - f30) / (f45 - f30)) * 0.55;
  return 0.45 * (1 - smooth01((t - f45) / (f60 - f45)));
}

/**
 * Fainter stars are culled first as we go down the window: the effective
 * limiting magnitude tightens with height, then only very bright stars remain.
 */
export function verticalLimitingMagnitude(
  y: number,
  height: number,
  baseLimit: number,
  mobile: boolean
): number {
  const t = clamp(y / height, 0, 1);
  const { f30, f45 } = verticalWindow(mobile);
  const fEnd = mobile ? 0.58 : 0.55;
  if (t <= f30) return baseLimit;
  if (t >= fEnd) return 1.2;
  if (t <= f45) return lerp(baseLimit, 3, smooth01((t - f30) / (f45 - f30)));
  return lerp(3, 1.2, smooth01((t - f45) / (fEnd - f45)));
}

/** Bright stars get a larger dot; faint stars still get a visible ~1px dot. */
export function magnitudeToRadius(magnitude: number): number {
  return clamp(2.6 - (magnitude - MIN_MAGNITUDE) * 0.22, 0.8, 2.6);
}

/** Continuous, monotonic alpha driven by the real visual magnitude. */
export function magnitudeToAlpha(
  magnitude: number,
  limitingMagnitude: number,
  twilight: number
): number {
  const span = Math.max(0.1, limitingMagnitude - MIN_MAGNITUDE);
  const norm = clamp((limitingMagnitude - magnitude) / span, 0, 1);
  return (MIN_ALPHA_FRACTION + (1 - MIN_ALPHA_FRACTION) * norm) * MAX_ALPHA * twilight;
}

type Rgb = readonly [number, number, number];

const COLOR_ANCHORS: Array<{ bv: number; rgb: Rgb }> = [
  { bv: -0.2, rgb: [178, 202, 255] },
  { bv: 0.0, rgb: [222, 232, 255] },
  { bv: 0.4, rgb: [255, 252, 246] },
  { bv: 0.8, rgb: [255, 240, 220] },
  { bv: 1.8, rgb: [255, 214, 178] },
];

/**
 * Very low saturation colour from the B-V index. Falls back to a neutral white
 * when the colour index is unknown.
 */
export function colorIndexToRgb(colorIndex?: number): Rgb {
  if (colorIndex === undefined || !isFinite(colorIndex)) return [255, 253, 248];

  if (colorIndex <= COLOR_ANCHORS[0].bv) return COLOR_ANCHORS[0].rgb;
  const last = COLOR_ANCHORS[COLOR_ANCHORS.length - 1];
  if (colorIndex >= last.bv) return last.rgb;

  for (let i = 0; i < COLOR_ANCHORS.length - 1; i += 1) {
    const a = COLOR_ANCHORS[i];
    const b = COLOR_ANCHORS[i + 1];
    if (colorIndex >= a.bv && colorIndex <= b.bv) {
      const t = (colorIndex - a.bv) / (b.bv - a.bv);
      return [
        Math.round(lerp(a.rgb[0], b.rgb[0], t)),
        Math.round(lerp(a.rgb[1], b.rgb[1], t)),
        Math.round(lerp(a.rgb[2], b.rgb[2], t)),
      ];
    }
  }
  return [255, 253, 248];
}

/**
 * Faint warm city glow, kept inside the top window so it never creates a band
 * in the clean body of the page.
 */
function drawSkyGlow(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  snapshot: SkySnapshot,
  style: RenderStyle,
  intensity: number
): void {
  if (!style.isDark || intensity <= 0) return;

  const h = camera.height;
  const { f30, f45, f60 } = verticalWindow(style.mobile);
  const rawBortle = snapshot.pollution.bortleApprox;
  const bortle = Number.isFinite(rawBortle) ? rawBortle : 8;
  const warmth = clamp((bortle - 4) / 5, 0, 1);
  const r = Math.round(lerp(58, 92, warmth));
  const g = Math.round(lerp(64, 76, warmth));
  const b = Math.round(lerp(86, 60, warmth));
  const peak = 0.05 * intensity;

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
  gradient.addColorStop(f30, `rgba(${r}, ${g}, ${b}, ${(peak * 0.5).toFixed(4)})`);
  gradient.addColorStop(f45, `rgba(${r}, ${g}, ${b}, ${(peak * 0.28).toFixed(4)})`);
  gradient.addColorStop(f60, `rgba(${r}, ${g}, ${b}, 0)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, camera.width, h);
}

export interface RenderedStar {
  star: SkyStar;
  point: ProjectedPoint;
  alpha: number;
}

/** Shared visibility and projection for drawing and pointer hit testing. */
export function projectSkyStars(
  snapshot: SkySnapshot,
  camera: Camera,
  style: RenderStyle
): RenderedStar[] {
  const themeFactor = style.isDark ? 1 : 0.14;
  const visibility = Number.isFinite(snapshot.visibility) ? snapshot.visibility * themeFactor : 0;
  if (visibility <= 0.001) return [];
  const fullSky = style.presentation === "look-up";
  const rendered: RenderedStar[] = [];

  for (const star of snapshot.stars) {
    const point = project(star.altitude, star.azimuth, camera);
    if (!point) continue;
    if (point.x < -4 || point.x > camera.width + 4 || point.y < -4 || point.y > camera.height + 4) {
      continue;
    }

    const skyMask = fullSky ? 1 : verticalSkyMask(point.y, camera.height, style.mobile);
    if (skyMask <= 0.004) continue;
    const limit = fullSky ? snapshot.pollution.limitingMagnitude : verticalLimitingMagnitude(
      point.y,
      camera.height,
      snapshot.pollution.limitingMagnitude,
      style.mobile
    );
    if (star.mag > limit) continue;

    const alpha = Math.min(0.96,
      magnitudeToAlpha(star.mag, snapshot.pollution.limitingMagnitude, visibility) * skyMask *
      (fullSky ? 1.15 : 1)
    );
    if (!Number.isFinite(alpha) || alpha <= 0.004) continue;
    rendered.push({ star, point, alpha });
  }
  return rendered;
}

/** Draw one static frame; astronomy and pointer events never run an animation loop. */
export function drawSky(
  ctx: CanvasRenderingContext2D,
  snapshot: SkySnapshot,
  camera: Camera,
  style: RenderStyle
): RenderedStar[] {
  ctx.clearRect(0, 0, camera.width, camera.height);
  if (style.presentation !== "look-up") {
    drawSkyGlow(ctx, camera, snapshot, style, Number.isFinite(snapshot.twilight) ? snapshot.twilight : 0);
  }
  const rendered = projectSkyStars(snapshot, camera, style);
  ctx.globalCompositeOperation = "source-over";

  for (const { star, point, alpha } of rendered) {
    const radius = magnitudeToRadius(star.mag);
    const [r, g, b] = colorIndexToRgb(star.colorIndex);
    const color = `${r}, ${g}, ${b}`;

    // Subtle halo for the brightest stars only.
    if (star.mag < 0.6) {
      const halo = radius * 3.4;
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, halo);
      gradient.addColorStop(0, `rgba(${color}, ${(alpha * 0.35).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, halo, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return rendered;
}
