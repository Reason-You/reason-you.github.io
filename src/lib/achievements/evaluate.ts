import { ACHIEVEMENTS, CAMPFIRE_DIRECTIONS, type AchievementId } from './definitions';
import { isStarlit, type MarshmallowOrigin, type MarshmallowOutcome } from './marshmallow';
import type { SkyFacing } from '../sky/look-up';

export interface ConfirmedMarshmallow {
  eaten: number;
  directions: readonly SkyFacing[];
  outcome: MarshmallowOutcome;
  origin: MarshmallowOrigin | null;
  meteorReleased?: boolean;
}

/** Quantity first, then the rare fireball, directions and ordinary starlight. */
export function evaluateAchievements(event: ConfirmedMarshmallow, unlocked: readonly AchievementId[]): AchievementId[] {
  return ACHIEVEMENTS.filter(a => {
    if (unlocked.includes(a.id)) return false;
    if (a.type === 'quantity') return event.eaten === a.milestone;
    if (a.type === 'directions') return CAMPFIRE_DIRECTIONS.every(facing => event.directions.includes(facing));
    if (a.type === 'starlight') return isStarlit(event.outcome);
    return event.outcome === 'fireball' && event.meteorReleased === true;
  }).sort((a, b) => a.order - b.order).map(a => a.id);
}
