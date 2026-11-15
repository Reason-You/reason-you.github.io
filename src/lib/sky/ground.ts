import { MOBILE_BREAKPOINT_PX, SKY_VIEW } from './constants';
import { project, type Camera } from './projection';

export const LOOK_UP_DEFAULT_ALTITUDE = 35;
export const CAMPFIRE_AZIMUTH = 0;
export const CAMPFIRE_ALTITUDE = -2;

const DEG = Math.PI / 180;
const CAMPFIRE_WIDTH = 136;
const CAMPFIRE_HEIGHT = 108;
const CAMPFIRE_REFERENCE_SCALE = 600;
const CAMPFIRE_MIN_SCALE = 0.68;
const GROUND_BOTTOM_CLEARANCE = 24;
const MOBILE_GROUND_BOTTOM_CLEARANCE = 56;
const MOBILE_VERTICAL_FOV = 75;

/** The zero-altitude boundary in an upright local camera. */
export function horizonScreenY(camera: Camera): number {
  const vertical = camera.up[2];
  if (vertical <= 1e-10) return Infinity;
  return camera.height * camera.centerYFraction + camera.scale * camera.forward[2] / vertical;
}

export interface CampfireProjection {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
}

/** Project the north-side foot point with the physical local camera. */
export function projectCampfire(camera: Camera): CampfireProjection {
  const point = project(CAMPFIRE_ALTITUDE, CAMPFIRE_AZIMUTH, camera);
  if (!point) return { x: 0, y: 0, scale: 1, visible: false };
  const scale = Math.max(CAMPFIRE_MIN_SCALE, camera.scale / (CAMPFIRE_REFERENCE_SCALE * point.depth));
  const halfWidth = CAMPFIRE_WIDTH * scale / 2;
  const height = CAMPFIRE_HEIGHT * scale;
  return {
    x: point.x,
    y: point.y,
    scale,
    visible: point.x + halfWidth > 0 && point.x - halfWidth < camera.width &&
      point.y > 0 && point.y - height < camera.height,
  };
}

/** Keep the northern campfire above the bottom controls in the preset view. */
export function presetAltitude(width: number, height: number): number {
  const scale = width < MOBILE_BREAKPOINT_PX
    ? height / 2 / Math.tan(MOBILE_VERTICAL_FOV * DEG / 2)
    : width / 2 / Math.tan(SKY_VIEW.horizontalFov * DEG / 2);
  const clearance = width < MOBILE_BREAKPOINT_PX ? MOBILE_GROUND_BOTTOM_CLEARANCE : GROUND_BOTTOM_CLEARANCE;
  const fitted = Math.atan((height / 2 - clearance) / scale) / DEG + CAMPFIRE_ALTITUDE;
  return Math.max(0, Math.min(LOOK_UP_DEFAULT_ALTITUDE, fitted));
}
