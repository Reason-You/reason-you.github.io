'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { constellationForHip, projectConstellation, readConstellationPreview, CONSTELLATION_ATTRIBUTION, type CONSTELLATIONS } from '@/lib/sky/constellations';
import type { Camera } from '@/lib/sky/projection';
import type { RenderedStar } from '@/lib/sky/renderer';

export default function ConstellationPreview({ hip, selection, rendered, camera }: {
  hip: number | null;
  selection: boolean;
  rendered: readonly RenderedStar[];
  camera: Camera;
}) {
  const alpha = readConstellationPreview(useSearchParams().get('constellationPreview'));
  const wanted = alpha === null ? null : constellationForHip(hip);
  const [shown, setShown] = useState<typeof CONSTELLATIONS[number] | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!wanted) { setShown(null); return; }
    if (selection) { setShown(wanted); return; }
    setShown(null);
    const timer = window.setTimeout(() => setShown(wanted), 200);
    return () => window.clearTimeout(timer);
  }, [wanted, selection]);
  const segments = useMemo(() => shown ? projectConstellation(shown, rendered, camera) : [], [shown, rendered, camera]);
  if (alpha === null) return null;
  return (
    <svg className="constellation-preview absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true"
      viewBox={`0 0 ${camera.width} ${camera.height}`}>
      <metadata>{CONSTELLATION_ATTRIBUTION}</metadata>
      <AnimatePresence mode="wait">
        {shown && segments.length > 0 && (
          <motion.g key={shown.id} data-constellation={shown.id} fill="none" stroke="#94a3b8" strokeWidth="0.6"
            initial={{ opacity: 0 }} animate={{ opacity: alpha }} exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}>
            {segments.map(line => <line key={`${line.fromHip}-${line.toHip}`} data-from-hip={line.fromHip} data-to-hip={line.toHip}
              x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y} />)}
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}
