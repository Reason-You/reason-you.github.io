'use client';

import { FastForward, RotateCcw } from 'lucide-react';
import { SkyHint, useSkyHints } from './SkyHints';

interface TrailControlsProps {
  holding: boolean;
  speed: number | null;
  offsetLabel: string | null;
  reduced: boolean;
  preview?: boolean;
  onHoldStart: () => boolean;
  onHoldEnd: () => void;
  onReturnNow: () => void;
  onBackToLive: () => void;
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
  preview,
  onHoldStart,
  onHoldEnd,
  onReturnNow,
  onBackToLive,
}: TrailControlsProps) {
  const { touch, canStartTrails, trailStarted } = useSkyHints();
  const resetLabel = preview ? 'Reset preview' : 'Back to now';
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
  const start = () => {
    if (holding || !canStartTrails) return;
    if (onHoldStart()) trailStarted(reduced);
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
        className={`sky-tool-button sky-time-button${holding ? ' is-holding' : ''}`}
        aria-pressed={reduced ? undefined : holding}
        aria-label={reduced ? undefined : 'Hold for trails. Hold to fast-forward the sky.'}
        onClick={reduced ? start : undefined}
        onPointerDown={event => {
          if (reduced) return;
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          start();
        }}
        onPointerUp={event => { if (event.button === 0 && event.isPrimary && holding) onHoldEnd(); }}
        onPointerCancel={event => { if (event.isPrimary && holding) onHoldEnd(); }}
        onLostPointerCapture={() => { if (holding) onHoldEnd(); }}
        onBlur={() => { if (holding) onHoldEnd(); }}
        onKeyDown={event => {
          if (reduced || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          if (event.repeat || holding) return;
          start();
        }}
        onKeyUp={event => {
          if (reduced || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          if (holding) onHoldEnd();
        }}
      >
        <FastForward size={16} aria-hidden="true" />
        <span>{reduced ? 'Show 1 hour of trails' : holding && speed ? `${speedText(speed)}×` : 'Hold for trails'}</span>
      </button>
      <SkyHint kind="trails" className="sky-discovery-hint--trails">
        {reduced ? `${touch ? 'Tap' : 'Click'} for trails` : 'Hold for trails'}
      </SkyHint>
      {!holding && (offsetLabel || preview) && (
        <div className="sky-time-offset">
          {offsetLabel && <span className="sky-time-pill" role="status">{offsetLabel}</span>}
          <button type="button" className="sky-tool-button sky-time-return" onClick={offsetLabel ? onReturnNow : onBackToLive}>
            <RotateCcw size={14} aria-hidden="true" />
            <span>{offsetLabel ? resetLabel : 'Back to live'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
