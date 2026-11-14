'use client';

import type React from 'react';

interface TrailControlsProps {
  holding: boolean;
  speed: number | null;
  offsetLabel: string | null;
  reduced: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onReturnNow: () => void;
}

function speedText(speed: number): string {
  return `${Math.round(speed / 10) * 10}`;
}

/**
 * Time-travel controls for the Look Up sky: hold the play button to
 * fast-forward (the longer the hold, the faster time runs), release to resume
 * at 1x. When the sky rests at a future moment, a "now" button returns it to
 * the present. Enter and Space use the same hold-to-accelerate speed curve.
 */
export default function TrailControls({
  holding,
  speed,
  offsetLabel,
  reduced,
  onHoldStart,
  onHoldEnd,
  onReturnNow,
}: TrailControlsProps) {
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

  return (
    <div
      className="sky-time-travel"
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onClick={stop}
      onContextMenu={event => event.preventDefault()}
    >
      <button
        type="button"
        className={`sky-time-button${holding ? ' is-holding' : ''}`}
        aria-pressed={holding}
        aria-label={reduced
          ? 'Reveal one hour of star trails'
          : 'Fast-forward the sky. Hold to accelerate, release to resume.'}
        onPointerDown={event => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (!holding) onHoldStart();
        }}
        onPointerUp={() => { if (holding) onHoldEnd(); }}
        onPointerCancel={() => { if (holding) onHoldEnd(); }}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (event.repeat || holding) return;
          onHoldStart();
        }}
        onKeyUp={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (holding) onHoldEnd();
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4 2.5v11l9-5.5z" />
        </svg>
      </button>
      <span className="sky-time-pill" aria-live="polite">
        {holding && speed ? `time ${speedText(speed)}x` : offsetLabel ? `time ${offsetLabel} · 1x` : 'time 1x'}
      </span>
      {!holding && offsetLabel && (
        <button
          type="button"
          className="sky-time-return"
          onClick={onReturnNow}
          aria-label="Return the sky to the present moment"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M2.8 8a5.2 5.2 0 1 0 1.5-3.7M2.8 1.8v3h3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          now
        </button>
      )}
    </div>
  );
}
