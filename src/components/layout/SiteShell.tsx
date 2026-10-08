'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import SkyInitializer from '@/components/ui/SkyInitializer';
import StarfieldBackground from '@/components/ui/StarfieldBackground';
import MeteorBackground from '@/components/ui/MeteorBackground';

interface SiteShellProps {
  navigation: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

type BackgroundPhase = 'steady' | 'fading-out' | 'fading-in';

export default function SiteShell({ navigation, footer, children }: SiteShellProps) {
  const pathname = usePathname();
  const isLookUp = pathname.replace(/\/$/, '') === '/look-up';
  const previousPath = useRef(pathname);
  const [enteringSky, setEnteringSky] = useState(false);
  const [backgroundPhase, setBackgroundPhase] = useState<BackgroundPhase>('steady');

  useLayoutEffect(() => {
    const wasLookUp = previousPath.current.replace(/\/$/, '') === '/look-up';
    previousPath.current = pathname;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const entering = isLookUp && !wasLookUp && !reducedMotion;
    const leaving = !isLookUp && wasLookUp && !reducedMotion;
    setEnteringSky(entering);
    setBackgroundPhase(entering ? 'fading-out' : leaving ? 'fading-in' : 'steady');
    if (!entering && !leaving) return;
    const timers: number[] = [];
    if (entering) {
      timers.push(window.setTimeout(() => setBackgroundPhase('steady'), 800));
      timers.push(window.setTimeout(() => setEnteringSky(false), 1000));
    }
    if (leaving) timers.push(window.setTimeout(() => setBackgroundPhase('steady'), 800));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [pathname, isLookUp]);

  // The old page background mounts one commit after the route change; start its
  // descent once it exists, in step with the incoming sky.
  useLayoutEffect(() => {
    if (backgroundPhase !== 'fading-out') return;
    const sky = document.querySelector<HTMLElement>('.look-up-sky');
    const background = document.querySelector('.sky-background');
    if (!sky || !background) return;
    const rect = sky.getBoundingClientRect();
    const mobile = window.innerWidth < 640;
    const offset = rect.top + rect.height / 2 - window.innerHeight * (mobile ? 0.35 : 0.3);
    const descent = background.animate(
      [
        { transform: 'translateY(0px)' },
        { transform: `translateY(${offset}px)` },
      ],
      { duration: 600, delay: 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
    );
    return () => descent.cancel();
  }, [backgroundPhase]);

  const backgroundClassName = `sky-background${backgroundPhase === 'fading-out' ? ' sky-background-fade-out'
    : backgroundPhase === 'fading-in' ? ' sky-background-fade-in' : ''}`;

  return (
    <>
      <SkyInitializer />
      {(!isLookUp || backgroundPhase === 'fading-out') && (
        <div className={backgroundClassName}>
          <StarfieldBackground />
          <MeteorBackground />
        </div>
      )}
      <div className={`relative z-10${isLookUp ? ` look-up-shell${enteringSky ? ' sky-entering' : ''}` : ''}`}>
        {navigation}
        <main className={isLookUp ? 'look-up-main' : 'min-h-screen pt-16 lg:pt-20'}>
          {children}
        </main>
        {footer}
      </div>
    </>
  );
}
