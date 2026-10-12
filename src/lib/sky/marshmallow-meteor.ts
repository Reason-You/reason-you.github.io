import { isStarlit, type MarshmallowOrigin, type MarshmallowOutcome } from '../achievements/marshmallow';

export interface MarshmallowMeteorFlight {
  id: number;
  kind: 'starlit' | 'fireball';
  origin: MarshmallowOrigin;
  control1: MarshmallowOrigin;
  control2: MarshmallowOrigin;
  end: MarshmallowOrigin;
  width: number;
  height: number;
  brightnessGain: number;
  durationMs: number;
}

export function createMarshmallowMeteor(id: number, outcome: MarshmallowOutcome, origin: MarshmallowOrigin | null,
  width: number, height: number, random: () => number = Math.random): MarshmallowMeteorFlight | null {
  if (!isStarlit(outcome) || !origin || width <= 0 || height <= 0) return null;
  const rare = outcome === 'fireball';
  const brightnessGain = rare ? 3 + 7 * random() : 1.5 + 1.3 * random();
  const durationMs = rare ? 1200 + 800 * random() : 800 + 350 * random();
  const direction = random() < 0.5 ? -1 : 1;
  const end = { x: Math.max(24, Math.min(width - 24, origin.x + direction * width * 0.42)), y: height * 0.24 };
  return { id, kind: rare ? 'fireball' : 'starlit', origin, width, height, brightnessGain, durationMs,
    control1: { x: origin.x + direction * width * 0.035, y: origin.y - Math.min(90, height * 0.15) },
    control2: { x: origin.x + direction * width * 0.28, y: end.y + (origin.y - end.y) * 0.16 }, end };
}

export function meteorPosition(flight: MarshmallowMeteorFlight, progress: number): MarshmallowOrigin {
  const t = Math.max(0, Math.min(1, progress)), q = 1 - t;
  const { origin: a, control1: b, control2: c, end: d } = flight;
  return { x: q*q*q*a.x + 3*q*q*t*b.x + 3*q*t*t*c.x + t*t*t*d.x,
    y: q*q*q*a.y + 3*q*q*t*b.y + 3*q*t*t*c.y + t*t*t*d.y };
}

export function meteorFrame(flight: MarshmallowMeteorFlight, elapsed: number, reduced: boolean) {
  const time = Math.max(0, Math.min(1, elapsed / flight.durationMs));
  const hold = flight.kind === 'fireball' ? 0.08 : 0.06;
  const progress = Math.max(0, Math.min(1, (time - hold) / (0.88 - hold)));
  const tailFraction = flight.kind === 'fireball' ? 0.46 : 0.18;
  const points = Array.from({ length: 12 }, (_, i) => meteorPosition(flight, Math.max(0, progress - tailFraction * (1 - i / 11))));
  const head = reduced ? flight.origin : points[points.length - 1];
  const path = reduced ? `M${head.x-12},${head.y+18} Q${head.x-4},${head.y+8} ${head.x},${head.y}` :
    points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const opacity = time < 0.88 ? 1 : Math.max(0, (1-time)/0.12);
  return { head, tail: reduced ? { x: head.x-12, y: head.y+18 } : points[0], path, opacity, progress };
}
