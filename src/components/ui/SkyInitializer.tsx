'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSkyStore } from '@/lib/stores/skyStore';

function InitializeSky() {
  const query = useSearchParams().toString();
  const initialize = useSkyStore((state) => state.initialize);

  useEffect(() => {
    void initialize(query);
  }, [query, initialize]);

  return null;
}

export default function SkyInitializer() {
  return (
    <Suspense fallback={null}>
      <InitializeSky />
    </Suspense>
  );
}
