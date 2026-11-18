'use client';

import { usePathname } from 'next/navigation';
import SkyLocationControls, { StarsAboveLocationControls } from '@/components/sky/SkyLocationControls';

interface FooterProps {
  lastUpdated?: string;
}

export default function Footer({ lastUpdated }: FooterProps) {
  const isLookUp = usePathname().replace(/\/$/, '') === '/stars-above';
  if (isLookUp) {
    return (
      <footer className="stars-above-footer">
        <StarsAboveLocationControls />
      </footer>
    );
  }
  const updatedDate = lastUpdated || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const observation = (
    <p className="sky-observation h-4 min-w-0 truncate whitespace-nowrap text-xs text-neutral-500" title={`Last updated: ${updatedDate}`}>
      <span className="sr-only sm:not-sr-only">Last updated: </span>{updatedDate}
    </p>
  );

  return (
    <footer className="border-t border-neutral-200/50 bg-neutral-50/50 dark:bg-neutral-900/50 dark:border-neutral-700/50">
      <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 xl:py-1">
        <SkyLocationControls
          observation={observation}
          attribution={(
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
