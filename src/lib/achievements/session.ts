import { cardinalFacing, SKY_DIRECTIONS, type SkyFacing } from '../sky/look-up';
import type { ConfirmedMarshmallow } from './evaluate';
import { roastTimings, sampleMarshmallowOutcome, type MarshmallowOrigin, type MarshmallowOutcome } from './marshmallow';

export type MarshmallowPhase = 'idle' | 'entering' | 'roasting' | 'ready' | 'eating' | 'retreat';
export const OBSERVATION_DWELL_MS = 700;

/** A settled look belongs to a cardinal direction, below the zenith viewing region. */
export function observationFacing(view: { azimuth: number; altitude: number }): SkyFacing | null {
  if (view.altitude >= 80) return null;
  const azimuth = ((view.azimuth % 360) + 360) % 360;
  const facing = cardinalFacing(azimuth);
  const difference = Math.abs(((azimuth - SKY_DIRECTIONS[facing].azimuth + 540) % 360) - 180);
  return difference <= 22.5 ? facing : null;
}

export interface CampfireSession {
  fireOn: boolean;
  phase: MarshmallowPhase;
  round: number;
  eaten: number;
  directions: readonly SkyFacing[];
  outcome: MarshmallowOutcome;
  timings: ReturnType<typeof roastTimings>;
  biteOrigin: MarshmallowOrigin | null;
  confirmed: boolean;
  completion: ConfirmedMarshmallow | null;
}

export const INITIAL_CAMPFIRE: CampfireSession = {
  fireOn: false, phase: 'idle', round: 0, eaten: 0, directions: [], outcome: 'normal',
  timings: roastTimings(0), biteOrigin: null, confirmed: false, completion: null,
};

export type CampfireAction =
  | { type: 'toggle' }
  | { type: 'enter' }
  | { type: 'roast'; roll: number }
  | { type: 'ready' }
  | { type: 'look'; facing: SkyFacing }
  | { type: 'eat'; origin?: MarshmallowOrigin | null }
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
  if (action.type === 'look') {
    return state.directions.includes(action.facing) ? state : { ...state, directions: [...state.directions, action.facing] };
  }
  if (action.type === 'enter' && (state.phase === 'idle' || (state.phase === 'eating' && state.confirmed))) {
    return { ...state, phase: 'entering', round: state.round + 1, outcome: 'normal', timings: roastTimings(state.eaten),
      biteOrigin: null, confirmed: false };
  }
  if (action.type === 'roast' && state.phase === 'entering') {
    return { ...state, phase: 'roasting', outcome: sampleMarshmallowOutcome(state.eaten + 1, action.roll) };
  }
  if (action.type === 'ready' && state.phase === 'roasting') return { ...state, phase: 'ready' };
  if (action.type === 'eat' && state.phase === 'ready') {
    return { ...state, phase: 'eating', biteOrigin: action.origin ?? null };
  }
  if (action.type === 'confirm' && state.phase === 'eating' && !state.confirmed) {
    const eaten = state.eaten + 1;
    return { ...state, eaten, confirmed: true,
      completion: { type: 'marshmallow', eaten, outcome: state.outcome, origin: state.biteOrigin } };
  }
  return state;
}
