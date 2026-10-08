'use client';

import { usePathname } from 'next/navigation';
import UseMySkyButton from '@/components/ui/UseMySkyButton';
import { formatSkyTime } from '@/lib/sky/time';
import { useLabelStore } from '@/lib/stores/labelStore';
import { useSkyStore } from '@/lib/stores/skyStore';

interface FooterProps {
  lastUpdated?: string;
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(2)}° ${value < 0 ? negative : positive}`;
}

export default function Footer({ lastUpdated }: FooterProps) {
  const isLookUp = usePathname().replace(/\/$/, '') === '/look-up';
  const snapshotDate = useSkyStore((state) => state.snapshotDate);
  const observer = useSkyStore((state) => state.observer);
  const pinnedCount = useLabelStore((state) => state.pinnedIds.length);
  const clearNames = useLabelStore((state) => state.clearAll);
  const skyLabel = observer.source === 'geolocation' ? 'Your sky' :
    observer.source === 'override' ? 'Custom sky' : 'Fudan sky';
  const coordinates = `${formatCoordinate(observer.latitude, 'N', 'S')}, ${formatCoordinate(observer.longitude, 'E', 'W')}`;

  return (
    <footer className="border-t border-neutral-200/50 bg-neutral-50/50 dark:bg-neutral-900/50 dark:border-neutral-700/50">
      <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="shrink-0 text-xs text-neutral-500">
            {isLookUp ? (
              <time dateTime={snapshotDate === null ? undefined : new Date(snapshotDate).toISOString()}>
                {snapshotDate === null ? 'Facing South' : formatSkyTime(snapshotDate)}
              </time>
            ) : (
              <>Last updated: {lastUpdated || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</>
            )}
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
                {isLookUp && pinnedCount > 0 && (
                  <>
                    <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">·</span>
                    <button
                      type="button"
                      onClick={clearNames}
                      className="whitespace-nowrap text-xs text-neutral-400 hover:text-accent dark:text-neutral-500 dark:hover:text-accent transition-colors duration-200 rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                    >
                      Clear star names
                    </button>
                  </>
                )}
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
