'use client';

import { useSkyStore } from '@/lib/stores/skyStore';

/**
 * Extremely low-key entry point for the starfield easter egg.
 * Geolocation is only requested after this button is pressed.
 */
export default function UseMySkyButton() {
  const status = useSkyStore((state) => state.status);
  const observer = useSkyStore((state) => state.observer);
  const requestMySky = useSkyStore((state) => state.requestMySky);
  const resetSky = useSkyStore((state) => state.resetSky);

  const isCustom = observer.source === 'geolocation';
  const locating = status === 'locating';

  const label = locating ? 'Locating…' : isCustom ? 'Back to Fudan sky' : 'Use my sky';

  return (
    <button
      type="button"
      onClick={() => {
        if (locating) return;
        if (isCustom) void resetSky();
        else void requestMySky();
      }}
      title={
        isCustom
          ? 'Return to the Fudan University sky'
          : 'Compute the sky from your own location (stays in your browser)'
      }
      className="text-xs text-neutral-400 hover:text-accent dark:text-neutral-500 dark:hover:text-accent transition-colors duration-200 rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
    >
      {label}
    </button>
  );
}
