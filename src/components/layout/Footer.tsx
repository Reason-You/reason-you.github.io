'use client';

import { usePathname } from 'next/navigation';
import SkyLocationControls from '@/components/sky/SkyLocationControls';
import { formatSkyTime, formatSkyTimeShort } from '@/lib/sky/time';
import { useSkyStore } from '@/lib/stores/skyStore';
import { useSkyDirection } from '@/components/sky/SkyDirection';
import { SKY_DIRECTIONS } from '@/lib/sky/look-up';

interface FooterProps {
  lastUpdated?: string;
}

export default function Footer({ lastUpdated }: FooterProps) {
  const isLookUp = usePathname().replace(/\/$/, '') === '/stars-above';
  const { facing, cycleFacing } = useSkyDirection();
  const direction = SKY_DIRECTIONS[facing];
  const snapshotDate = useSkyStore((state) => state.snapshotDate);
  const nightPreview = useSkyStore(state => state.nightPreview);
  const updatedDate = lastUpdated || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const observation = isLookUp ? (
    <p className="sky-observation h-4 min-w-0 flex flex-nowrap whitespace-nowrap items-center gap-1.5 text-xs text-neutral-500">
      {snapshotDate !== null && <>
        <time className="min-w-0 truncate" title={formatSkyTime(snapshotDate)} dateTime={new Date(snapshotDate).toISOString()}>
          <span className="hidden xl:inline">{formatSkyTime(snapshotDate)}</span>
          <span className="hidden sm:inline xl:hidden">{formatSkyTimeShort(snapshotDate)}</span>
          <span className="sm:hidden">{new Date(snapshotDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
        </time>
        <span className="shrink-0" aria-hidden="true">·</span>
      </>}
      <button type="button" onClick={cycleFacing}
        className="sky-direction-trigger relative shrink-0 inline-flex items-center gap-1 rounded hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        title={`${direction.azimuth.toFixed(1)}° true azimuth`}
        aria-label={`Facing ${direction.name}, ${direction.azimuth.toFixed(1)} degrees. Turn to face ${SKY_DIRECTIONS[direction.next].name}`}>
        <span><span className="hidden sm:inline">Facing </span>{direction.name}</span>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-50" aria-hidden="true">
          <path d="M12.8 6A5 5 0 1 0 13 10M13 2v4H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {nightPreview && <span data-night-preview="" className="hidden sm:inline shrink-0 whitespace-nowrap" title="Astronomical-night preview at the displayed time">· Preview</span>}
    </p>
  ) : (
    <p className="sky-observation h-4 min-w-0 truncate whitespace-nowrap text-xs text-neutral-500" title={`Last updated: ${updatedDate}`}>
      <span className="sr-only sm:not-sr-only">Last updated: </span>{updatedDate}
    </p>
  );

  return (
    <footer className="border-t border-neutral-200/50 bg-neutral-50/50 dark:bg-neutral-900/50 dark:border-neutral-700/50">
      <div className="relative max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 xl:py-1">
        <SkyLocationControls
          observation={observation}
          attribution={!isLookUp && (
            <span className="shrink-0 inline-flex items-center whitespace-nowrap text-xs text-neutral-500">
              <span aria-hidden="true" className="mr-2 text-neutral-300 dark:text-neutral-700">·</span>
              <a href="https://github.com/xyjoey/PRISM" target="_blank" rel="noopener noreferrer">
                Built with PRISM
              </a>
              <span className="ml-2">🚀</span>
            </span>
          )}
        />
      </div>
    </footer>
  );
}
