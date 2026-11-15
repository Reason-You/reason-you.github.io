import { ACHIEVEMENTS, CAMPFIRE_DIRECTIONS, type AchievementId } from './definitions';
import { isStarlit, type MarshmallowOrigin, type MarshmallowOutcome } from './marshmallow';
import type { SkyFacing } from '../sky/look-up';

export interface ConfirmedMarshmallow {
  type: 'marshmallow';
  eaten: number;
  outcome: MarshmallowOutcome;
  origin: MarshmallowOrigin | null;
  meteorReleased?: boolean;
}

export interface SkyLookEvent {
  type: 'look';
  directions: readonly SkyFacing[];
}

export type AchievementEvent = ConfirmedMarshmallow | SkyLookEvent;

/** Confirmed bites and settled looks award their own discoveries. */
export function evaluateAchievements(event: AchievementEvent, unlocked: readonly AchievementId[]): AchievementId[] {
  return ACHIEVEMENTS.filter(a => {
    if (unlocked.includes(a.id)) return false;
    if (event.type === 'look') {
      return a.type === 'directions' && CAMPFIRE_DIRECTIONS.every(facing => event.directions.includes(facing));
    }
    if (a.type === 'quantity') return event.eaten === a.milestone;
    if (a.type === 'starlight') return isStarlit(event.outcome);
    return a.type === 'fireball' && event.outcome === 'fireball' && event.meteorReleased === true;
  }).sort((a, b) => a.order - b.order).map(a => a.id);
}
