'use client';

import { useEffect, useRef } from 'react';
import { useSkyStore } from '@/lib/stores/skyStore';
import { resolveTheme, useThemeStore } from '@/lib/stores/themeStore';
import { computeSky, SkySnapshot } from '@/lib/sky/astro';
import { Camera, createCamera, project } from '@/lib/sky/projection';
import { drawSky } from '@/lib/sky/renderer';
import { LIGHT_POLLUTION_META } from '@/lib/sky/light-pollution-meta';
import {
  MOBILE_BREAKPOINT_PX,
  SKY_CENTER_Y,
  SKY_UPDATE_INTERVAL_MS,
  SKY_VIEW,
} from '@/lib/sky/constants';

/**
 * A very restrained, real-sky background layer.
 *
 * It sits at z-0 behind the page content (same layer as the meteor canvas) and
 * computes a genuine view towards the south from the current observer. Astronomy
 * runs a few times per hour, never per frame.
 */
export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const snapshotRef = useRef<SkySnapshot | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const prevObserverRef = useRef<unknown>(null);

  const theme = useThemeStore((state) => state.theme);
  const effectiveTheme = resolveTheme(theme);
  const isDark = effectiveTheme === 'dark';
  const isDarkRef = useRef(isDark);

  const observer = useSkyStore((state) => state.observer);
  const pollution = useSkyStore((state) => state.pollution);
  const dateOverride = useSkyStore((state) => state.dateOverride);
  const applyOverrides = useSkyStore((state) => state.applyOverrides);
  const loadPollution = useSkyStore((state) => state.loadPollution);

  // Initialise URL overrides and VIIRS data. Location changes resolve their
  // own data in the store before committing the new observer.
  useEffect(() => {
    applyOverrides();
    void loadPollution();
  }, [applyOverrides, loadPollution]);

  // Recompute + draw whenever the observer, light pollution or time override changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    let rafId = 0;
    let fadeTimer = 0;
    const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT_PX;

    const effectivePollution = () =>
      isMobile()
        ? { ...pollution, limitingMagnitude: Math.min(pollution.limitingMagnitude, 5.0) }
        : pollution;

    const compute = () => {
      const date = dateOverride !== null ? new Date(dateOverride) : new Date();
      return computeSky(date, observer, effectivePollution());
    };

    const render = () => {
      const currentCtx = ctxRef.current;
      const camera = cameraRef.current;
      const snapshot = snapshotRef.current;
      if (!currentCtx || !camera || !snapshot) return;

      // Optional inspection hook for manual verification: ?skydebug=1
      if (typeof window !== 'undefined' && window.location.search.includes('skydebug')) {
        (window as unknown as Record<string, unknown>).__sky = {
          observer: { latitude: snapshot.observer.latitude, longitude: snapshot.observer.longitude },
          lightPollution: {
            source: snapshot.pollution.source,
            datasetYear: snapshot.pollution.datasetYear ?? LIGHT_POLLUTION_META.datasetYear,
            sourceVersion: LIGHT_POLLUTION_META.sourceVersion,
            tile: snapshot.pollution.tile,
            rawRadianceOrProxy: snapshot.pollution.lightProxy,
            limitingMagnitude: snapshot.pollution.limitingMagnitude,
            bortleApprox: snapshot.pollution.bortleApprox,
          },
          visibleStars: snapshot.stars.length,
          sunAltitude: snapshot.sunAltitude,
          twilight: snapshot.twilight,
          visibility: snapshot.visibility,
          camera,
          snapshot,
          project: (name: string) => {
            const star = snapshot.stars.find((s) => s.name === name);
            if (!star) return null;
            const point = project(star.altitude, star.azimuth, camera);
            return { ...star, point };
          },
        };
      }

      drawSky(currentCtx, snapshot, camera, { isDark: isDarkRef.current, mobile: isMobile() });
    };
    renderRef.current = render;

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cameraRef.current = createCamera(
        width,
        height,
        SKY_VIEW,
        isMobile() ? SKY_CENTER_Y.mobile : SKY_CENTER_Y.desktop
      );
      render();
    };

    let lastMobile = isMobile();
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        if (isMobile() !== lastMobile) {
          lastMobile = isMobile();
          snapshotRef.current = compute();
        }
        resize();
      });
    };

    const preparedSnapshot = compute();
    const start = () => {
      snapshotRef.current = preparedSnapshot;
      resize();
    };

    // Smoothly cross-fade only when the observer actually changes ("Use my sky"
    // or a test URL). A light-pollution refresh redraws in place.
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const observerChanged =
      prevObserverRef.current !== null && prevObserverRef.current !== observer;
    prevObserverRef.current = observer;

    if (observerChanged && !prefersReducedMotion) {
      canvas.style.transition = 'opacity 300ms ease';
      canvas.style.opacity = '0';
      fadeTimer = window.setTimeout(() => {
        start();
        canvas.style.opacity = '1';
      }, 300);
    } else {
      canvas.style.transition = 'none';
      canvas.style.opacity = '1';
      start();
    }

    window.addEventListener('resize', onResize);
    const interval = window.setInterval(() => {
      snapshotRef.current = compute();
      render();
    }, SKY_UPDATE_INTERVAL_MS);

    return () => {
      window.removeEventListener('resize', onResize);
      window.clearInterval(interval);
      cancelAnimationFrame(rafId);
      window.clearTimeout(fadeTimer);
    };
  }, [observer, pollution, dateOverride]);

  // Redraw the current sky without interrupting an observer transition.
  useEffect(() => {
    isDarkRef.current = isDark;
    renderRef.current();
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 h-screen w-full z-0"
    />
  );
}
