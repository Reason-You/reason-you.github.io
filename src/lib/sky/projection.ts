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

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
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
  const worldUp: [number, number, number] = [0, 0, 1];
  const right = normalize(cross(forward, worldUp));
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
  const [east, north, up] = horizonToVector(altitudeDeg, azimuthDeg);

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
