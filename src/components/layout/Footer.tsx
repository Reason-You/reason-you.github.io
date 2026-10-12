'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import UseMySkyButton from '@/components/ui/UseMySkyButton';
import { formatSkyTime, formatSkyTimeShort } from '@/lib/sky/time';
import { useSkyStore } from '@/lib/stores/skyStore';
import { useSkyDirection } from '@/components/sky/SkyDirection';
import { SKY_DIRECTIONS } from '@/lib/sky/look-up';

interface FooterProps {
  lastUpdated?: string;
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(2)}° ${value < 0 ? negative : positive}`;
}

export default function Footer({ lastUpdated }: FooterProps) {
  const isLookUp = usePathname().replace(/\/$/, '') === '/stars-above';
  const { facing, cycleFacing } = useSkyDirection();
  const direction = SKY_DIRECTIONS[facing];
  const snapshotDate = useSkyStore((state) => state.snapshotDate);
  const observer = useSkyStore((state) => state.observer);
  const [locationOpen, setLocationOpen] = useState(false);
  const skyLabel = observer.source === 'geolocation' ? 'Your sky' :
    observer.source === 'override' ? 'Custom sky' : 'Fudan sky';
  const coordinates = `${formatCoordinate(observer.latitude, 'N', 'S')}, ${formatCoordinate(observer.longitude, 'E', 'W')}`;

  useEffect(() => {
    setLocationOpen(false);
  }, [isLookUp]);

  useEffect(() => {
    if (!locationOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLocationOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.sky-location')) setLocationOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [locationOpen]);

  if (isLookUp) {
    return (
      <footer className="border-t border-neutral-200/50 bg-neutral-50/50 dark:bg-neutral-900/50 dark:border-neutral-700/50">
        <div className="relative max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          {locationOpen && (
            <div className="sky-location sky-location-popover" role="dialog" aria-label="Observing location">
              <p className="font-medium text-neutral-600 dark:text-neutral-300">{skyLabel}</p>
              <p>{observer.name}</p>
              <p className="tabular-nums">{coordinates}</p>
              <p>Facing {direction.name} · {direction.azimuth.toFixed(1)}°</p>
            </div>
          )}
          <div className="flex flex-col md:flex-row items-center justify-between gap-1.5 md:gap-2 text-xs text-neutral-500">
            <p className="sky-observation shrink-0 flex items-center gap-1.5">
              {snapshotDate !== null && <>
                <time dateTime={new Date(snapshotDate).toISOString()}>
                  <span className="hidden md:inline">{formatSkyTime(snapshotDate)}</span>
                  <span className="md:hidden">{formatSkyTimeShort(snapshotDate)}</span>
                </time>
                <span aria-hidden="true">·</span>
              </>}
              <button type="button" onClick={cycleFacing}
                className="sky-direction-trigger relative inline-flex items-center gap-1 rounded hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                title={`${direction.azimuth.toFixed(1)}° true azimuth`}
                aria-label={`Facing ${direction.name}, ${direction.azimuth.toFixed(1)} degrees. Turn to face ${SKY_DIRECTIONS[direction.next].name}`}>
                Facing {direction.name}
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-50" aria-hidden="true">
                  <path d="M12.8 6A5 5 0 1 0 13 10M13 2v4H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </p>
            <div className="sky-location relative flex items-center gap-x-2 whitespace-nowrap">
              <button
                type="button"
                aria-expanded={locationOpen}
                onClick={() => setLocationOpen((open) => !open)}
                className="sky-location-trigger relative rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              >
                {skyLabel}
              </button>
              <span aria-hidden="true" className="hidden md:inline text-neutral-300 dark:text-neutral-700">·</span>
              <span className="hidden md:inline tabular-nums">{coordinates}</span>
              <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">·</span>
              <UseMySkyButton />
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-neutral-200/50 bg-neutral-50/50 dark:bg-neutral-900/50 dark:border-neutral-700/50">
      <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="shrink-0 text-xs text-neutral-500">
            <>Last updated: {lastUpdated || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</>
          </p>
          <div className="min-w-0 flex flex-col sm:flex-row sm:flex-wrap items-center justify-center sm:justify-end gap-x-2 gap-y-2 text-xs text-neutral-500">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <span className="whitespace-nowrap">{skyLabel}</span>
                <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">·</span>
                <span className="whitespace-nowrap tabular-nums">{coordinates}</span>
              </span>
              <span className="inline-flex items-center gap-x-2">
                <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">·</span>
                <UseMySkyButton />
              </span>
            </div>
            <span aria-hidden="true" className="hidden sm:inline text-neutral-300 dark:text-neutral-700">·</span>
            <span className="inline-flex items-center whitespace-nowrap">
              <a href="https://github.com/xyjoey/PRISM" target="_blank" rel="noopener noreferrer">
                Built with PRISM
              </a>
              <span className="ml-2">🚀</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
