'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSkyStore } from '@/lib/stores/skyStore';

function InitializeSky() {
  const query = useSearchParams().toString();
  const onStarsAbove = usePathname().replace(/\/$/, '') === '/stars-above';
  const initialize = useSkyStore((state) => state.initialize);

  useEffect(() => {
    void initialize(query, onStarsAbove);
  }, [query, onStarsAbove, initialize]);

  return null;
}

export default function SkyInitializer() {
  return (
    <Suspense fallback={null}>
      <InitializeSky />
    </Suspense>
  );
}
