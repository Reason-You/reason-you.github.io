'use client';

import { useSkyStore } from '@/lib/stores/skyStore';
import { MapPin, School } from 'lucide-react';

/**
 * Extremely low-key entry point for the starfield easter egg.
 * Manual location and default-sky selection share this single entry point.
 */
export default function UseMySkyButton() {
  const status = useSkyStore((state) => state.status);
  const observer = useSkyStore((state) => state.observer);
  const requestMySky = useSkyStore((state) => state.requestMySky);
  const resetSky = useSkyStore((state) => state.resetSky);

  const isCustom = observer.source === 'geolocation';
  const locating = status === 'locating';
  const busy = locating || status === 'resetting';
  const Icon = isCustom ? School : MapPin;

  const label = locating ? 'Locating…' : status === 'resetting' ? 'Switching…' :
    isCustom ? 'Back to Fudan sky' : 'Use my sky';

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        if (busy) return;
        if (isCustom) void resetSky();
        else void requestMySky();
      }}
      title={
        isCustom
          ? 'Return to the Fudan University sky'
          : 'Compute the sky from your own location (stays in your browser)'
      }
      className="sky-footer-action inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap text-xs text-neutral-500 hover:text-accent transition-colors duration-200 rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
    >
      <Icon size={12} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
