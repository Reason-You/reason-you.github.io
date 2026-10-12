'use client';

import { createContext, Suspense, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { readFacing, SKY_DIRECTIONS, type SkyFacing } from '@/lib/sky/look-up';

const DirectionContext = createContext({
  facing: 'south' as SkyFacing,
  cycleFacing: () => {},
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
  const [facing, setFacing] = useState<SkyFacing>('south');
  return (
    <DirectionContext.Provider value={{ facing,
      cycleFacing: () => setFacing(current => SKY_DIRECTIONS[current].next),
    }}>
      <Suspense fallback={null}><DirectionQuery active={active} onChange={setFacing} /></Suspense>
      {children}
    </DirectionContext.Provider>
  );
}

export const useSkyDirection = () => useContext(DirectionContext);
