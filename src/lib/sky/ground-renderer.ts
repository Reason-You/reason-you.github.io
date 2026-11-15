import { horizonScreenY } from './ground';
import type { Camera } from './projection';

/** The local ground stays fixed while the celestial camera advances in time. */
export function drawGround(
  ctx: CanvasRenderingContext2D, camera: Camera, isDark: boolean, twilight: number, backgroundColor: string,
): void {
  const { width, height } = camera;
  ctx.clearRect(0, 0, width, height);
  const horizon = horizonScreenY(camera);
  if (horizon >= height) return;
  const top = Math.max(0, horizon);
  const daylight = 1 - Math.max(0, Math.min(1, twilight));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, top, width, height - top);
  // A narrow atmospheric band gives the distant edge depth in either theme.
  const bandTop = Math.max(0, top - 28);
  const haze = ctx.createLinearGradient(0, bandTop, 0, top);
  const tint = isDark ? '132,148,170' : '100,116,139';
  haze.addColorStop(0, `rgba(${tint},0)`);
  haze.addColorStop(1, `rgba(${tint},${isDark ? 0.04 + daylight * 0.035 : 0.055})`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, bandTop, width, top - bandTop);
  ctx.restore();
}
