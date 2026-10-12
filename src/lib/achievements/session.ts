import type { SkyFacing } from '../sky/look-up';
import type { ConfirmedMarshmallow } from './evaluate';
import { roastTimings, sampleMarshmallowOutcome, type MarshmallowOrigin, type MarshmallowOutcome } from './marshmallow';

export type MarshmallowPhase = 'idle' | 'entering' | 'roasting' | 'ready' | 'eating' | 'retreat';
export interface CampfireSession {
  fireOn: boolean;
  phase: MarshmallowPhase;
  round: number;
  eaten: number;
  directions: readonly SkyFacing[];
  outcome: MarshmallowOutcome;
  timings: ReturnType<typeof roastTimings>;
  biteFacing: SkyFacing | null;
  biteOrigin: MarshmallowOrigin | null;
  confirmed: boolean;
  completion: ConfirmedMarshmallow | null;
}

export const INITIAL_CAMPFIRE: CampfireSession = {
  fireOn: false, phase: 'idle', round: 0, eaten: 0, directions: [], outcome: 'normal',
  timings: roastTimings(0), biteFacing: null, biteOrigin: null, confirmed: false, completion: null,
};

export type CampfireAction =
  | { type: 'toggle' }
  | { type: 'enter' }
  | { type: 'roast'; roll: number }
  | { type: 'ready' }
  | { type: 'eat'; facing: SkyFacing; origin?: MarshmallowOrigin | null }
  | { type: 'confirm' }
  | { type: 'idle' };

/** The visit owns the count; each ignition owns its direction set. */
export function campfireReducer(state: CampfireSession, action: CampfireAction): CampfireSession {
  if (action.type === 'toggle') {
    const fireOn = !state.fireOn;
    return { ...INITIAL_CAMPFIRE, round: state.round, eaten: state.eaten, timings: roastTimings(state.eaten), fireOn,
      phase: !fireOn && state.phase !== 'idle' ? 'retreat' : 'idle' };
  }
  if (!state.fireOn) {
    return action.type === 'idle' && state.phase === 'retreat' ? { ...state, phase: 'idle' } : state;
  }
  if (action.type === 'enter' && (state.phase === 'idle' || (state.phase === 'eating' && state.confirmed))) {
    return { ...state, phase: 'entering', round: state.round + 1, outcome: 'normal', timings: roastTimings(state.eaten),
      biteFacing: null, biteOrigin: null, confirmed: false };
  }
  if (action.type === 'roast' && state.phase === 'entering') {
    return { ...state, phase: 'roasting', outcome: sampleMarshmallowOutcome(state.eaten + 1, action.roll) };
  }
  if (action.type === 'ready' && state.phase === 'roasting') return { ...state, phase: 'ready' };
  if (action.type === 'eat' && state.phase === 'ready') {
    return { ...state, phase: 'eating', biteFacing: action.facing, biteOrigin: action.origin ?? null };
  }
  if (action.type === 'confirm' && state.phase === 'eating' && !state.confirmed && state.biteFacing !== null) {
    const eaten = state.eaten + 1;
    const directions = state.directions.includes(state.biteFacing) ? state.directions : [...state.directions, state.biteFacing];
    return { ...state, eaten, directions, confirmed: true,
      completion: { eaten, directions, outcome: state.outcome, origin: state.biteOrigin } };
  }
  return state;
}
