export type MarshmallowOutcome = 'normal' | 'starlit' | 'fireball' | 'burnt';
export const SPECIAL_EXCLUSIONS: readonly number[] = [10, 20, 30, 40, 42, 64, 75, 88, 99, 100];

export function canHaveSpecialOutcome(number: number): boolean {
  return !SPECIAL_EXCLUSIONS.includes(number);
}

/** One draw at roasting entry; outcomes are mutually exclusive. */
export function sampleMarshmallowOutcome(number: number, roll: number): MarshmallowOutcome {
  if (!canHaveSpecialOutcome(number) || roll < 0.82) return 'normal';
  if (roll < 0.94) return 'starlit';
  if (roll < 0.97) return 'fireball';
  return 'burnt';
}

export function isStarlit(outcome: MarshmallowOutcome): boolean {
  return outcome === 'starlit' || outcome === 'fireball';
}

/** Cooking time excludes the fixed, legible bite feedback. */
export function roastTimings(eaten: number) {
  const total = 800 + 1600 * Math.exp(-eaten / 24);
  return { wait: total * 5 / 24, enter: total * 7 / 24, roast: total / 2, total };
}

export interface MarshmallowOrigin { x: number; y: number }
