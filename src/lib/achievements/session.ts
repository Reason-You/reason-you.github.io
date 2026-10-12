import type { SkyFacing } from '../sky/look-up';
import { isBurntMarshmallow, type ConfirmedMarshmallow } from './evaluate';

export type MarshmallowPhase = 'idle' | 'entering' | 'roasting' | 'ready' | 'eating' | 'retreat';
export interface CampfireSession {
  fireOn: boolean;
  phase: MarshmallowPhase;
  round: number;
  eaten: number;
  ignitionStartCount: number;
  directions: readonly SkyFacing[];
  burnt: boolean;
  biteFacing: SkyFacing | null;
  confirmed: boolean;
  completion: ConfirmedMarshmallow | null;
}

export const INITIAL_CAMPFIRE: CampfireSession = {
  fireOn: false, phase: 'idle', round: 0, eaten: 0, ignitionStartCount: 0, directions: [],
  burnt: false, biteFacing: null, confirmed: false, completion: null,
};

export type CampfireAction =
  | { type: 'toggle' }
  | { type: 'enter' }
  | { type: 'roast'; roll: number }
  | { type: 'ready' }
  | { type: 'eat'; facing: SkyFacing }
  | { type: 'confirm' }
  | { type: 'idle' };

/** The session owns the only count; timers merely request guarded transitions. */
export function campfireReducer(state: CampfireSession, action: CampfireAction): CampfireSession {
  if (action.type === 'toggle') {
    const fireOn = !state.fireOn;
    return { ...INITIAL_CAMPFIRE, round: state.round, eaten: state.eaten, ignitionStartCount: state.eaten, fireOn,
      phase: !fireOn && state.phase !== 'idle' ? 'retreat' : 'idle' };
  }
  if (!state.fireOn) {
    return action.type === 'idle' && state.phase === 'retreat' ? { ...state, phase: 'idle' } : state;
  }
  if (action.type === 'enter' && (state.phase === 'idle' || (state.phase === 'eating' && state.confirmed))) {
    return { ...state, phase: 'entering', round: state.round + 1, burnt: false, biteFacing: null, confirmed: false };
  }
  if (action.type === 'roast' && state.phase === 'entering') {
    return { ...state, phase: 'roasting', burnt: isBurntMarshmallow(state.eaten + 1, action.roll, state.eaten - state.ignitionStartCount + 1) };
  }
  if (action.type === 'ready' && state.phase === 'roasting') return { ...state, phase: 'ready' };
  if (action.type === 'eat' && state.phase === 'ready') return { ...state, phase: 'eating', biteFacing: action.facing };
  if (action.type === 'confirm' && state.phase === 'eating' && !state.confirmed && state.biteFacing !== null) {
    const eaten = state.eaten + 1;
    const directions = state.directions.includes(state.biteFacing) ? state.directions : [...state.directions, state.biteFacing];
    return { ...state, eaten, directions, confirmed: true, completion: { eaten, directions, burnt: state.burnt } };
  }
  return state;
}
