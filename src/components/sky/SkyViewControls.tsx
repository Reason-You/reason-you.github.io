'use client';

import { Compass, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { directionName, SKY_DIRECTIONS } from '@/lib/sky/look-up';
import { useSkyDirection } from './SkyDirection';

export default function SkyViewControls({ dragging = false }: { dragging?: boolean }) {
  const { facing, view, isCustomView, cycleFacing, resetView } = useSkyDirection();
  const directionButtonRef = useRef<HTMLButtonElement>(null);
  const wasDragging = useRef(false);
  const [showAltitude, setShowAltitude] = useState(false);
  const direction = SKY_DIRECTIONS[facing];
  const currentDirection = directionName(view.azimuth);
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

  useEffect(() => {
    if (dragging) {
      wasDragging.current = true;
      return;
    }
    if (!wasDragging.current) return;
    setShowAltitude(true);
    const timer = window.setTimeout(() => {
      wasDragging.current = false;
      setShowAltitude(false);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [dragging]);

  return (
    <div className="sky-view-controls" onPointerDown={stop} onPointerUp={stop}
      onPointerMove={stop} onClick={stop}>
      {(dragging || showAltitude) && <span className="sky-view-altitude" aria-hidden="true">{Math.round(view.altitude)}°</span>}
      {isCustomView && (
        <button type="button" onClick={() => {
          resetView();
          directionButtonRef.current?.focus({ preventScroll: true });
        }}
          className="sky-tool-button sky-view-reset"
          aria-label="Reset view"
          title={`Reset to ${direction.name} at the default viewing angle`}>
          <RotateCcw size={14} aria-hidden="true" />
        </button>
      )}
        <button ref={directionButtonRef} type="button" onClick={cycleFacing}
          className="sky-tool-button sky-direction-trigger"
          title={`${view.azimuth.toFixed(1)}° true azimuth, ${view.altitude.toFixed(1)}° altitude`}
          aria-label={`Facing ${currentDirection}, ${view.azimuth.toFixed(1)} degrees true azimuth, ${view.altitude.toFixed(1)} degrees altitude. Turn to face ${SKY_DIRECTIONS[direction.next].name}`}>
          <Compass size={16} aria-hidden="true" />
          <span>{currentDirection}</span>
        </button>
    </div>
  );
}
