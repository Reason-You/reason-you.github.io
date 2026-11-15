'use client';

import { createContext, Suspense, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { normalizeSkyView, readFacing, SKY_DIRECTIONS, viewForFacing, type SkyFacing, type SkyView } from '@/lib/sky/look-up';
import { LOOK_UP_DEFAULT_ALTITUDE, presetAltitude } from '@/lib/sky/ground';

interface SkyDirectionState {
  facing: SkyFacing;
  view: SkyView;
  presetAltitude: number;
}

interface SkyDirectionValue extends SkyDirectionState {
  setView: (view: SkyView) => void;
  cycleFacing: () => void;
  resetView: () => void;
  isCustomView: boolean;
  fitViewport: (width: number, height: number) => void;
}

const DirectionContext = createContext<SkyDirectionValue>({
  facing: 'north',
  view: viewForFacing('north'),
  presetAltitude: LOOK_UP_DEFAULT_ALTITUDE,
  setView: () => {},
  cycleFacing: () => {},
  resetView: () => {},
  isCustomView: false,
  fitViewport: () => {},
});

function DirectionQuery({ active, onChange }: {
  active: boolean; onChange: (facing: SkyFacing) => void;
}) {
  const params = useSearchParams();
  const facing = params.get('facing');
  useLayoutEffect(() => {
    onChange(active ? readFacing(facing) : 'south');
  }, [active, facing, onChange]);
  return null;
}

/** Route-scoped view state, shared with the footer; never persisted or used by Home. */
export function SkyDirectionProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [state, setState] = useState<SkyDirectionState>(() => {
    const facing = active ? 'north' : 'south';
    return { facing, view: viewForFacing(facing), presetAltitude: LOOK_UP_DEFAULT_ALTITUDE };
  });
  const applyFacing = useCallback((facing: SkyFacing) => {
    setState(current => ({ ...current, facing, view: viewForFacing(facing, current.presetAltitude) }));
  }, []);
  const setView = useCallback((next: SkyView) => {
    const view = normalizeSkyView(next);
    setState(current => current.view.azimuth === view.azimuth && current.view.altitude === view.altitude
      ? current : { ...current, view });
  }, []);
  const cycleFacing = useCallback(() => {
    setState(current => {
      const facing = SKY_DIRECTIONS[current.facing].next;
      return { ...current, facing, view: viewForFacing(facing, current.presetAltitude) };
    });
  }, []);
  const resetView = useCallback(() => {
    setState(current => ({ ...current, view: viewForFacing(current.facing, current.presetAltitude) }));
  }, []);
  const fitViewport = useCallback((width: number, height: number) => {
    const altitude = presetAltitude(width, height);
    setState(current => {
      if (current.presetAltitude === altitude) return current;
      const preset = viewForFacing(current.facing, current.presetAltitude);
      const custom = current.view.azimuth !== preset.azimuth || current.view.altitude !== preset.altitude;
      return { ...current, presetAltitude: altitude,
        view: custom ? current.view : viewForFacing(current.facing, altitude) };
    });
  }, []);
  const value = useMemo(() => {
    const preset = viewForFacing(state.facing, state.presetAltitude);
    return {
      ...state, setView, cycleFacing, resetView, fitViewport,
      isCustomView: state.view.azimuth !== preset.azimuth || state.view.altitude !== preset.altitude,
    };
  }, [state, setView, cycleFacing, resetView, fitViewport]);
  return (
    <DirectionContext.Provider value={value}>
      <Suspense fallback={null}><DirectionQuery active={active} onChange={applyFacing} /></Suspense>
      {children}
    </DirectionContext.Provider>
  );
}

export const useSkyDirection = () => useContext(DirectionContext);
