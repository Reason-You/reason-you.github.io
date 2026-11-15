'use client';

import { useRef } from 'react';
import { directionName, SKY_DIRECTIONS } from '@/lib/sky/look-up';
import { useSkyDirection } from './SkyDirection';

export default function SkyViewControls() {
  const { facing, view, isCustomView, cycleFacing, resetView } = useSkyDirection();
  const directionButtonRef = useRef<HTMLButtonElement>(null);
  const direction = SKY_DIRECTIONS[facing];
  const currentDirection = directionName(view.azimuth);
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

  return (
    <div className="sky-view-controls" onPointerDown={stop} onPointerUp={stop}
      onPointerMove={stop} onClick={stop}>
      <span className="inline-flex min-w-20 shrink-0 flex-row-reverse items-center gap-2 text-xs text-neutral-500">
        <button ref={directionButtonRef} type="button" onClick={cycleFacing}
          className="sky-direction-trigger relative shrink-0 inline-flex items-center gap-1 rounded hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          title={`${view.azimuth.toFixed(1)}° true azimuth, ${view.altitude.toFixed(1)}° altitude`}
          aria-label={`Facing ${currentDirection}, ${view.azimuth.toFixed(1)} degrees true azimuth, ${view.altitude.toFixed(1)} degrees altitude. Turn to face ${SKY_DIRECTIONS[direction.next].name}`}>
          <span><span className="hidden sm:inline">Facing </span>{currentDirection}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-50" aria-hidden="true">
            <path d="M12.8 6A5 5 0 1 0 13 10M13 2v4H9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="inline-flex h-4 w-6 shrink-0 items-center justify-center">
          {isCustomView && (
            <button type="button" onClick={() => {
              resetView();
              directionButtonRef.current?.focus({ preventScroll: true });
            }}
              className="sky-view-reset relative inline-flex h-4 w-6 shrink-0 items-center justify-center rounded hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              aria-label="Reset view"
              title={`Reset to ${direction.name} at the default viewing angle`}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <path d="M3 6a5 5 0 1 1-.3 4M3 2v4h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </span>
      </span>
    </div>
  );
}
