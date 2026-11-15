'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import SkyLocationControls from '@/components/sky/SkyLocationControls';
import { formatSkyTime, formatSkyTimeShort, formatSkyTimeCompact } from '@/lib/sky/time';
import { useSkyStore } from '@/lib/stores/skyStore';

interface FooterProps {
  lastUpdated?: string;
}

export default function Footer({ lastUpdated }: FooterProps) {
  const isLookUp = usePathname().replace(/\/$/, '') === '/stars-above';
  const snapshotDate = useSkyStore((state) => state.snapshotDate);
  const nightPreview = useSkyStore(state => state.nightPreview);
  const updatedDate = lastUpdated || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const skyTime = useMemo(() => {
    if (!isLookUp || snapshotDate === null) return null;
    const full = formatSkyTime(snapshotDate);
    return {
      full,
      short: formatSkyTimeShort(snapshotDate),
      compact: formatSkyTimeCompact(snapshotDate),
      label: `Device time in ${Intl.DateTimeFormat().resolvedOptions().timeZone}: ${full}`,
      dateTime: new Date(snapshotDate).toISOString(),
    };
  }, [isLookUp, snapshotDate]);

  const observation = isLookUp ? (
    <p className="sky-observation h-4 min-w-0 flex flex-nowrap whitespace-nowrap items-center gap-1.5 text-xs text-neutral-500">
      {snapshotDate !== null && skyTime && <>
        <time className="min-w-0 truncate" title={skyTime.label} aria-label={skyTime.label} dateTime={skyTime.dateTime}>
          <span className="hidden xl:inline">{skyTime.full}</span>
          <span className="hidden sm:inline xl:hidden">{skyTime.short}</span>
          <span className="sm:hidden">{skyTime.compact}</span>
        </time>
      </>}
      {nightPreview && <span data-night-preview="" className="hidden sm:inline shrink-0 whitespace-nowrap" title="Astronomical-night preview at the displayed time">Preview</span>}
    </p>
  ) : (
    <p className="sky-observation h-4 min-w-0 truncate whitespace-nowrap text-xs text-neutral-500" title={`Last updated: ${updatedDate}`}>
      <span className="sr-only sm:not-sr-only">Last updated: </span>{updatedDate}
    </p>
  );

  return (
    <footer className={isLookUp ? 'border-t border-transparent bg-background'
      : 'border-t border-neutral-200/50 bg-neutral-50/50 dark:bg-neutral-900/50 dark:border-neutral-700/50'}>
      <div className={`relative mx-auto px-4 sm:px-6 lg:px-8 xl:py-1 ${isLookUp ? 'max-w-[96rem]' : 'max-w-[88rem]'}`}>
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
