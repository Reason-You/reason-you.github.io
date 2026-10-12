import type { SkyFacing } from '../sky/look-up';

interface AchievementDefinition {
  id: string;
  name: string;
  icon: string;
  type: 'quantity' | 'directions' | 'burnt';
  condition: string;
  description: string;
  order: number;
  milestone?: number;
}

export const ACHIEVEMENTS = [
  { id: 'cosmic-roaster', name: 'Cosmic Roaster', icon: 'flame', type: 'quantity', milestone: 10, condition: 'Eat 10 marshmallows during one visit to Stars Above.', description: '10 marshmallows', order: 10 },
  { id: 'still-hungry', name: 'Still Hungry?', icon: 'utensils', type: 'quantity', milestone: 20, condition: 'Eat 20 marshmallows during one visit to Stars Above.', description: '20 marshmallows', order: 20 },
  { id: 'phd-in-marshmallows', name: 'Ph.D. in Marshmallows', icon: 'graduation', type: 'quantity', milestone: 30, condition: 'Eat 30 marshmallows during one visit to Stars Above.', description: '30 marshmallows', order: 30 },
  { id: 'the-answer-was-marshmallows', name: 'The Answer Was Marshmallows', icon: 'orbit', type: 'quantity', milestone: 42, condition: 'Eat 42 marshmallows during one visit to Stars Above.', description: '42 marshmallows', order: 42 },
  { id: 'halfway-to-the-end-of-the-universe', name: 'Halfway to the End of the Universe', icon: 'eclipse', type: 'quantity', milestone: 50, condition: 'Eat 50 marshmallows during one visit to Stars Above.', description: '50 marshmallows', order: 50 },
  { id: '64-bit-sugar-rush', name: '64-bit Sugar Rush', icon: 'binary', type: 'quantity', milestone: 64, condition: 'Eat 64 marshmallows during one visit to Stars Above.', description: '64 marshmallows', order: 64 },
  { id: 'three-quarters-still-here', name: 'Three Quarters. Still Here?', icon: 'pie', type: 'quantity', milestone: 75, condition: 'Eat 75 marshmallows during one visit to Stars Above.', description: '75 marshmallows', order: 75 },
  { id: '88-constellations-one-campfire', name: '88 Constellations, One Campfire', icon: 'waypoints', type: 'quantity', milestone: 88, condition: 'Eat 88 marshmallows during one visit to Stars Above.', description: '88 marshmallows', order: 88 },
  { id: 'just-one-more', name: 'Just One More.', icon: 'plus', type: 'quantity', milestone: 99, condition: 'Eat 99 marshmallows during one visit to Stars Above.', description: '99 marshmallows', order: 99 },
  { id: 'at-the-end-of-the-universe', name: 'At the End of the Universe', icon: 'infinity', type: 'quantity', milestone: 100, condition: 'Eat 100 marshmallows during one visit to Stars Above.', description: '100 marshmallows', order: 100 },
  { id: 'four-skies-one-campfire', name: 'Four Skies, One Campfire', icon: 'compass', type: 'directions', condition: 'Eat a marshmallow facing each cardinal direction in one campfire.', description: 'One marshmallow in each direction, in one campfire.', order: 110 },
  { id: 'a-little-too-close-to-the-sun', name: 'A Little Too Close to the Sun', icon: 'sun', type: 'burnt', condition: 'Eat a burnt marshmallow.', description: 'A burnt marshmallow, still eaten.', order: 120 },
] as const satisfies readonly AchievementDefinition[];

export type AchievementId = typeof ACHIEVEMENTS[number]['id'];
export const CAMPFIRE_DIRECTIONS: readonly SkyFacing[] = ['south', 'west', 'north', 'east'];
export const BURNT_EXCLUSIONS: readonly number[] = [...ACHIEVEMENTS.filter(a => a.type === 'quantity').map(a => a.milestone), 40];
export const BURNT_PROBABILITY = 0.08;
export const ACHIEVEMENT_STORAGE_KEY = 'stars-above-achievements-v1';

export function isAchievementId(value: unknown): value is AchievementId {
  return ACHIEVEMENTS.some(a => a.id === value);
}
