'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { constellationForStarId, projectConstellation, readConstellationPreview, CONSTELLATIONS, CONSTELLATION_ATTRIBUTION } from '@/lib/sky/constellations';
import type { Camera } from '@/lib/sky/projection';
import type { RenderedStar } from '@/lib/sky/renderer';

export default function ConstellationPreview({ starId, pinnedConstellations, rendered, camera }: {
  starId: number | null;
  pinnedConstellations: string[];
  rendered: readonly RenderedStar[];
  camera: Camera;
}) {
  const alpha = readConstellationPreview(useSearchParams().get('constellationPreview'));
  const wanted = alpha === null ? null : constellationForStarId(starId);
  const [shown, setShown] = useState<typeof CONSTELLATIONS[number] | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    setShown(null);
    if (!wanted) return;
    const timer = window.setTimeout(() => setShown(wanted), 200);
    return () => window.clearTimeout(timer);
  }, [wanted]);
  const figures = useMemo(() => {
    const ids = new Set(pinnedConstellations);
    if (shown) ids.add(shown.id);
    return CONSTELLATIONS.filter(c => ids.has(c.id)).map(c => ({
      constellation: c, segments: projectConstellation(c, rendered, camera),
    })).filter(c => c.segments.length > 0);
  }, [shown, pinnedConstellations, rendered, camera]);
  if (alpha === null) return null;
  return (
    <svg className="constellation-preview absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true"
      viewBox={`0 0 ${camera.width} ${camera.height}`}>
      <metadata>{CONSTELLATION_ATTRIBUTION}</metadata>
      <AnimatePresence>
        {figures.map(({ constellation, segments }) => (
          <motion.g key={constellation.id} data-constellation={constellation.id} fill="none" stroke="#94a3b8" strokeWidth="0.6"
            initial={{ opacity: 0 }} animate={{ opacity: alpha }} exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}>
            {segments.map(line => <line key={`${line.fromHip}-${line.toHip}`} data-from-hip={line.fromHip} data-to-hip={line.toHip}
              x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y} />)}
          </motion.g>
        ))}
      </AnimatePresence>
    </svg>
  );
}
