'use client';

import type React from 'react';
import { SkyHint, useSkyHints } from './SkyHints';

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
  const { touch, canStartTrails, trailStarted, trailEnded } = useSkyHints();
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
  const start = () => {
    if (holding || !canStartTrails) return;
    onHoldStart();
    trailStarted(reduced);
  };
  const finish = () => {
    onHoldEnd();
    if (!reduced) trailEnded();
  };

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
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          start();
        }}
        onPointerUp={event => { if (event.button === 0 && event.isPrimary && holding) finish(); }}
        onPointerCancel={event => { if (event.isPrimary && holding) onHoldEnd(); }}
        onBlur={() => { if (holding) onHoldEnd(); }}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (event.repeat || holding) return;
          start();
        }}
        onKeyUp={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (holding) finish();
        }}
      >
        <span className="sky-time-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3v10l6-5zM8 3v10l6-5z" />
          </svg>
        </span>
        <span>{reduced ? (touch ? 'Tap' : 'Click') : 'Hold'}</span>
      </button>
      <SkyHint kind="trails" className="sky-discovery-hint--trails">
        {reduced ? `${touch ? 'Tap' : 'Click'} for trails` : 'Hold for trails'}
      </SkyHint>
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
