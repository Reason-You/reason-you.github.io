import { SKY_VIEW } from "./constants";

export interface View {
  /** Azimuth the centre of the view points at (degrees clockwise from north). */
  azimuth: number;
  /** Altitude mapped to the vertical centre (degrees). */
  centerAltitude: number;
  /** Horizontal field of view (degrees). */
  horizontalFov: number;
}

export interface Camera {
  width: number;
  height: number;
  /** Gnomonic (pinhole) projection scale in pixels. */
  scale: number;
  /** Fraction of the canvas height that the view centre maps to. */
  centerYFraction: number;
  /** Orthonormal camera basis in local ENU coordinates (east, north, up). */
  right: [number, number, number];
  up: [number, number, number];
  forward: [number, number, number];
}

export interface ProjectedPoint {
  x: number;
  y: number;
  /** Distance along the view direction; <= 0 means behind the camera. */
  depth: number;
}

export type SkyDirectionVector = [number, number, number];

const DEG = Math.PI / 180;

/** Unit vector in local ENU coordinates for an altitude/azimuth pair. */
export function horizonToVector(altitudeDeg: number, azimuthDeg: number): [number, number, number] {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  const cosAlt = Math.cos(alt);
  return [cosAlt * Math.sin(az), cosAlt * Math.cos(az), Math.sin(alt)];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Build a pinhole camera that looks at `view` from the observer's position.
 * Pixels are square: a single scale is shared by both axes.
 *
 * `centerYFraction` places the view centre on the canvas; 0.5 is the middle.
 * The star window uses a value near the top so that the lower, southern sky
 * still reaches the bottom of the visible window.
 */
export function createCamera(
  width: number,
  height: number,
  view: View = SKY_VIEW,
  centerYFraction = 0.5
): Camera {
  const forward = horizonToVector(view.centerAltitude, view.azimuth);
  const azimuth = view.azimuth * DEG;
  const right: [number, number, number] = [Math.cos(azimuth), -Math.sin(azimuth), 0];
  const up = cross(right, forward);
  const scale = width / 2 / Math.tan((view.horizontalFov * DEG) / 2);

  return { width, height, scale, centerYFraction, right, up, forward };
}

/**
 * Project a horizontal coordinate to screen space.
 * Returns null when the point is behind the view direction (characteristic of
 * a perspective/gnomonic projection, which looks like a window into the sky).
 */
export function project(
  altitudeDeg: number,
  azimuthDeg: number,
  camera: Camera
): ProjectedPoint | null {
  return projectSkyDirection(horizonToVector(altitudeDeg, azimuthDeg), camera);
}

/** A screen position as a unit direction in the physical camera's local ENU frame. */
export function unprojectSkyPoint(
  point: Pick<ProjectedPoint, 'x' | 'y'>,
  camera: Camera,
): SkyDirectionVector {
  const x = (point.x - camera.width / 2) / camera.scale;
  const y = (camera.height * camera.centerYFraction - point.y) / camera.scale;
  const east = camera.forward[0] + x * camera.right[0] + y * camera.up[0];
  const north = camera.forward[1] + x * camera.right[1] + y * camera.up[1];
  const up = camera.forward[2] + x * camera.right[2] + y * camera.up[2];
  const length = Math.hypot(east, north, up);
  return [east / length, north / length, up / length];
}

/** Project a local unit direction, retaining offscreen positions for trail heads. */
export function projectSkyDirection(
  direction: SkyDirectionVector,
  camera: Camera,
): ProjectedPoint | null {
  const [east, north, up] = direction;

  const depth = east * camera.forward[0] + north * camera.forward[1] + up * camera.forward[2];
  if (depth <= 0.02) return null;

  const xCam = east * camera.right[0] + north * camera.right[1] + up * camera.right[2];
  const yCam = east * camera.up[0] + north * camera.up[1] + up * camera.up[2];

  return {
    x: camera.width / 2 + (xCam / depth) * camera.scale,
    y: camera.height * camera.centerYFraction - (yCam / depth) * camera.scale,
    depth,
  };
}

/** Clip a sky arc to the horizon and camera frustum before perspective division. */
export function projectSkySegment(
  from: { altitude: number; azimuth: number },
  to: { altitude: number; azimuth: number },
  camera: Camera,
  horizon: readonly number[] = [0, 0, 1],
): { from: ProjectedPoint; to: ProjectedPoint } | null {
  return clipSkyDirections(
    horizonToVector(from.altitude, from.azimuth),
    horizonToVector(to.altitude, to.azimuth),
    camera,
    horizon,
  );
}

/** Clip local trail directions to the ground and camera frame before projection. */
export function projectSkyDirectionSegment(
  from: SkyDirectionVector,
  to: SkyDirectionVector,
  camera: Camera,
): { from: ProjectedPoint; to: ProjectedPoint } | null {
  return clipSkyDirections(from, to, camera, [0, 0, 1]);
}

function clipSkyDirections(
  from: SkyDirectionVector,
  to: SkyDirectionVector,
  camera: Camera,
  horizon: readonly number[],
): { from: ProjectedPoint; to: ProjectedPoint } | null {
  const coordinates = (direction: SkyDirectionVector) => {
    const [east, north, up] = direction;
    return {
      x: east * camera.right[0] + north * camera.right[1] + up * camera.right[2],
      y: east * camera.up[0] + north * camera.up[1] + up * camera.up[2],
      depth: east * camera.forward[0] + north * camera.forward[1] + up * camera.forward[2],
      altitude: east * horizon[0] + north * horizon[1] + up * horizon[2],
    };
  };
  const a = coordinates(from), b = coordinates(to);
  const planes = (point: typeof a) => [
    point.altitude,
    point.depth - 0.02,
    camera.width / 2 * point.depth + camera.scale * point.x,
    camera.width / 2 * point.depth - camera.scale * point.x,
    camera.height * camera.centerYFraction * point.depth - camera.scale * point.y,
    camera.height * (1 - camera.centerYFraction) * point.depth + camera.scale * point.y,
  ];
  const starts = planes(a), ends = planes(b);
  let low = 0, high = 1;
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i], end = ends[i];
    if (start < 0 && end < 0) return null;
    if (start < 0) low = Math.max(low, start / (start - end));
    if (end < 0) high = Math.min(high, start / (start - end));
    if (low >= high) return null;
  }
  const pointAt = (t: number): ProjectedPoint => {
    const point = t === 0 ? a : t === 1 ? b : {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      depth: a.depth + (b.depth - a.depth) * t,
    };
    return {
      x: Math.max(0, Math.min(camera.width, camera.width / 2 + point.x / point.depth * camera.scale)),
      y: Math.max(0, Math.min(camera.height, camera.height * camera.centerYFraction - point.y / point.depth * camera.scale)),
      depth: point.depth,
    };
  };
  return { from: pointAt(low), to: pointAt(high) };
}
