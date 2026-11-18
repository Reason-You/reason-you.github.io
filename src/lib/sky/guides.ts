import { Observer, Refraction, Rotation_EQD_HOR } from 'astronomy-engine';
import type { ObserverSpec } from './constants';
import { horizonToVector, projectSkyPolyline, type Camera, type ProjectedPoint, type SkyDirectionVector } from './projection';

const DEG = Math.PI / 180;
const HOUR = Math.PI / 12;
const LOCAL_ZENITH = [0, 0, 1];

export interface SkyGuideSegment { from: ProjectedPoint; to: ProjectedPoint }
export interface SkyGuideLine {
  kind: 'ra' | 'dec';
  value: number;
  segments: SkyGuideSegment[];
}
export interface SkyGuidesGeometry { lines: SkyGuideLine[] }
export interface SkyGuidesStyle { isDark: boolean; horizon?: readonly number[] }

interface HorizontalGuideLine { kind: 'ra' | 'dec'; value: number; points: SkyDirectionVector[] }
let cachedGrid: {
  timestamp: number; latitude: number; longitude: number; lines: HorizontalGuideLine[];
} | null = null;

/** Equator-of-date coordinates use the same sidereal rotation and refraction as the stars. */
function horizontalGrid(date: Date, observer: Pick<ObserverSpec, 'latitude' | 'longitude'>): HorizontalGuideLine[] {
  const timestamp = date.getTime();
  if (cachedGrid && cachedGrid.timestamp === timestamp && cachedGrid.latitude === observer.latitude &&
      cachedGrid.longitude === observer.longitude) return cachedGrid.lines;
  const matrix = Rotation_EQD_HOR(date, new Observer(observer.latitude, observer.longitude, 10)).rot;
  const point = (ra: number, dec: number): SkyDirectionVector => {
    const x = Math.cos(dec * DEG) * Math.cos(ra * HOUR);
    const y = Math.cos(dec * DEG) * Math.sin(ra * HOUR);
    const z = Math.sin(dec * DEG);
    const north = matrix[0][0] * x + matrix[1][0] * y + matrix[2][0] * z;
    const west = matrix[0][1] * x + matrix[1][1] * y + matrix[2][1] * z;
    const up = matrix[0][2] * x + matrix[1][2] * y + matrix[2][2] * z;
    const altitude = Math.atan2(up, Math.hypot(north, west)) / DEG;
    return horizonToVector(altitude + Refraction('normal', altitude), (Math.atan2(-west, north) / DEG + 360) % 360);
  };
  const lines: HorizontalGuideLine[] = [];
  for (let dec = -75; dec <= 75; dec += 15) {
    const points = Array.from({ length: 181 }, (_, i) => point(i * 2 / 15, dec));
    lines.push({ kind: 'dec', value: dec, points });
  }
  for (let ra = 0; ra < 24; ra += 2) {
    const points = Array.from({ length: 91 }, (_, i) => point(ra, -90 + i * 2));
    lines.push({ kind: 'ra', value: ra, points });
  }
  cachedGrid = { timestamp, latitude: observer.latitude, longitude: observer.longitude, lines };
  return lines;
}

/** A fixed-date grid can be projected through the same time-rotated camera as the star field. */
export function createSkyGuides(
  date: Date,
  observer: Pick<ObserverSpec, 'latitude' | 'longitude'>,
  camera: Camera,
  horizon: readonly number[] = LOCAL_ZENITH,
): SkyGuidesGeometry {
  const lines = horizontalGrid(date, observer).map(({ kind, value, points }) => ({
    kind, value, segments: projectSkyPolyline(points, camera, horizon),
  }));
  return { lines };
}

/** Draw the equatorial grid on the same CSS-pixel canvas transform as the stars. */
export function drawSkyGuides(
  ctx: CanvasRenderingContext2D,
  date: Date,
  observer: Pick<ObserverSpec, 'latitude' | 'longitude'>,
  camera: Camera,
  { isDark, horizon = LOCAL_ZENITH }: SkyGuidesStyle,
): void {
  const { lines } = createSkyGuides(date, observer, camera, horizon);
  ctx.clearRect(0, 0, camera.width, camera.height);
  ctx.save();
  ctx.strokeStyle = isDark ? '#94a3b8' : '#64748b';
  ctx.lineCap = 'butt';
  for (const line of lines) {
    ctx.globalAlpha = line.kind === 'dec' ? (line.value === 0 ? 0.48 : 0.36) : 0.24;
    ctx.lineWidth = line.kind === 'dec' ? (line.value === 0 ? 0.85 : 0.75) : 0.65;
    ctx.beginPath();
    for (const { from, to } of line.segments) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
