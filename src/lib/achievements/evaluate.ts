import { ACHIEVEMENTS, BURNT_EXCLUSIONS, BURNT_PROBABILITY, CAMPFIRE_DIRECTIONS, type AchievementId } from './definitions';
import type { SkyFacing } from '../sky/look-up';

export interface ConfirmedMarshmallow {
  eaten: number;
  directions: readonly SkyFacing[];
  burnt: boolean;
}

/** Evaluate only a completed bite. Definition order is notification priority. */
export function evaluateAchievements(event: ConfirmedMarshmallow, unlocked: readonly AchievementId[]): AchievementId[] {
  return ACHIEVEMENTS.filter(a => {
    if (unlocked.includes(a.id)) return false;
    if (a.type === 'quantity') return event.eaten === a.milestone;
    if (a.type === 'directions') return CAMPFIRE_DIRECTIONS.every(facing => event.directions.includes(facing));
    return event.burnt;
  }).map(a => a.id);
}

export function canBurnMarshmallow(number: number, fireOrdinal = number): boolean {
  return fireOrdinal >= 5 && !BURNT_EXCLUSIONS.includes(number);
}

export function isBurntMarshmallow(number: number, roll: number, fireOrdinal = number): boolean {
  return canBurnMarshmallow(number, fireOrdinal) && roll < BURNT_PROBABILITY;
}
