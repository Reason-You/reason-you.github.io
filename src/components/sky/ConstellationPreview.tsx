'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import ConstellationLabel from './ConstellationLabel';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { constellationForStarId, selectConstellationLabel, projectConstellation, readConstellationPreview, CONSTELLATIONS, CONSTELLATION_ATTRIBUTION } from '@/lib/sky/constellations';
import type { Camera } from '@/lib/sky/projection';
import type { RenderedStar } from '@/lib/sky/renderer';
import type { SkyStar } from '@/lib/sky/astro';
import { MOBILE_BREAKPOINT_PX } from '@/lib/sky/constants';

export default function ConstellationPreview({ starId, selectedStarIds, pinnedConstellations, rendered, constellationStars, camera, skyRef, sceneRef }: {
  starId: number | null;
  selectedStarIds: readonly number[];
  pinnedConstellations: string[];
  skyRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<HTMLDivElement | null>;
  rendered: readonly RenderedStar[];
  constellationStars: readonly SkyStar[];
  camera: Camera;
}) {
  const preview = useSearchParams().get('constellationPreview');
  const alpha = readConstellationPreview(preview);
  const mobile = camera.width < MOBILE_BREAKPOINT_PX;
  const opacity = mobile && preview === null ? 0.2 : alpha;
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
      constellation: c, segments: projectConstellation(c, constellationStars, camera),
    })).filter(c => c.segments.length > 0);
  }, [shown, pinnedConstellations, constellationStars, camera]);
  const labelId = selectConstellationLabel(shown?.id ?? null, selectedStarIds, pinnedConstellations,
    figures.map(figure => figure.constellation.id));
  const labelFigure = figures.find(figure => figure.constellation.id === labelId);
  const anchorId = shown?.id === labelId ? starId : [...selectedStarIds].reverse().find(id => constellationForStarId(id)?.id === labelId);
  const anchor = rendered.find(entry => entry.star.id === anchorId)?.point ?? null;
  if (alpha === null) return null;
  return (
    <>
    <svg className="constellation-preview absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true"
      viewBox={`0 0 ${camera.width} ${camera.height}`}>
      <metadata>{CONSTELLATION_ATTRIBUTION}</metadata>
      <AnimatePresence>
        {figures.map(({ constellation, segments }) => (
          <motion.g key={constellation.id} data-constellation={constellation.id} fill="none" stroke="#94a3b8" strokeWidth={mobile ? 0.9 : 0.6}
            initial={{ opacity: 0 }} animate={{ opacity: opacity ?? 0 }} exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}>
            {segments.map(line => <line key={`${line.fromHip}-${line.toHip}`} data-from-hip={line.fromHip} data-to-hip={line.toHip}
              x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y} />)}
          </motion.g>
        ))}
      </AnimatePresence>
    </svg>
    <AnimatePresence mode="wait">
      {labelFigure && <ConstellationLabel key={labelFigure.constellation.id}
        constellation={labelFigure.constellation} segments={labelFigure.segments} anchor={anchor} rendered={rendered} camera={camera}
        skyRef={skyRef} sceneRef={sceneRef} />}
    </AnimatePresence>
    </>
  );
}
