'use client';

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import MeteorBackground from '@/components/ui/MeteorBackground';
import { useSkyStore } from '@/lib/stores/skyStore';
import { useLabelStore } from '@/lib/stores/labelStore';
import Campfire from './Campfire';
import { resolveTheme, useThemeStore } from '@/lib/stores/themeStore';
import { computeSky, type SkySnapshot } from '@/lib/sky/astro';
import { createCamera, type Camera } from '@/lib/sky/projection';
import { drawSky } from '@/lib/sky/renderer';
import { MOBILE_BREAKPOINT_PX, SKY_CENTER_Y, SKY_UPDATE_INTERVAL_MS, SKY_VIEW } from '@/lib/sky/constants';
import {
  createLookUpCamera, hitTestStar, interactiveStars, LOOK_UP_HIT_RADIUS,
  positionStarLabel, type InteractiveStar,
} from '@/lib/sky/look-up';

interface SkyFrame {
  camera: Camera;
  stars: InteractiveStar[];
}

function StarLabel({ star, camera }: { star: InteractiveStar; camera: Camera }) {
  const labelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState({ left: star.point.x + 18, top: star.point.y });

  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    setPosition(positionStarLabel(star.point.x, star.point.y, camera.width, camera.height,
      label.offsetWidth, label.offsetHeight));
  }, [star, camera]);

  return (
    <motion.div
      ref={labelRef}
      id="look-up-label"
      role="status"
      className="look-up-label absolute pointer-events-none select-none text-neutral-500"
      style={position}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}
    >
      <div lang="zh-CN" className="text-sm leading-6">{star.name.chinese}</div>
      <div className="text-xs leading-5">{star.name.english}</div>
    </motion.div>
  );
}

export default function LookUpSky() {
  const skyRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skyRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const snapshotRef = useRef<SkySnapshot | null>(null);
  const starsRef = useRef<InteractiveStar[]>([]);
  const renderRef = useRef<() => void>(() => {});
  const theme = useThemeStore((state) => state.theme);
  const isDark = resolveTheme(theme) === 'dark';
  const isDarkRef = useRef(isDark);
  const observer = useSkyStore((state) => state.observer);
  const pollution = useSkyStore((state) => state.pollution);
  const dateOverride = useSkyStore((state) => state.dateOverride);
  const setSnapshotDate = useSkyStore((state) => state.setSnapshotDate);
  const [frame, setFrame] = useState<SkyFrame | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const pinnedIds = useLabelStore((state) => state.pinnedIds);
  const togglePinned = useLabelStore((state) => state.toggle);
  const clearPinned = useLabelStore((state) => state.clearAll);
  const reconcilePinned = useLabelStore((state) => state.reconcile);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const sky = skyRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!sky || !canvas || !ctx) return;

    let snapshot: SkySnapshot;
    let computeDurationMs = 0;
    let camera: Camera;
    let rafId = 0;
    const compute = () => {
      const started = performance.now();
      snapshot = computeSky(dateOverride === null ? new Date() : new Date(dateOverride), observer, pollution);
      snapshotRef.current = snapshot;
      computeDurationMs = performance.now() - started;
    };
    const render = () => {
      if (!camera || !snapshot) return;
      const started = performance.now();
      const rendered = drawSky(ctx, snapshot, camera, {
        isDark: isDarkRef.current,
        mobile: camera.width < MOBILE_BREAKPOINT_PX,
        presentation: 'look-up',
      });
      setSnapshotDate(snapshot.date.getTime());
      const stars = interactiveStars(rendered, camera);
      starsRef.current = stars;
      reconcilePinned(stars.map(({ star }) => star.id));
      setFrame({ camera, stars });

      if (new URLSearchParams(window.location.search).has('skydebug')) {
        (window as unknown as Record<string, unknown>).__sky = {
          observer: snapshot.observer,
          lightPollution: snapshot.pollution,
          snapshot, camera, rendered, interactiveStars: stars,
          computeDurationMs, renderDurationMs: performance.now() - started,
        };
      }
    };
    renderRef.current = render;
    const resize = () => {
      const width = sky.clientWidth;
      const height = sky.clientHeight;
      if (!width || !height) return;
      const bounds = sky.getBoundingClientRect();
      skyRectRef.current = { left: bounds.left, top: bounds.top, width, height };
      const dpr = Math.min(window.devicePixelRatio || 1, width < MOBILE_BREAKPOINT_PX ? 1.5 : 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera = createLookUpCamera(width, height);
      render();
    };
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(resize);
    });

    compute();
    resize();
    resizeObserver.observe(sky);
    const timer = dateOverride === null ? window.setInterval(() => {
      compute();
      render();
    }, SKY_UPDATE_INTERVAL_MS) : null;
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
      if (timer !== null) window.clearInterval(timer);
      renderRef.current = () => {};
    };
  }, [observer, pollution, dateOverride, setSnapshotDate, reconcilePinned]);

  useEffect(() => {
    isDarkRef.current = isDark;
    renderRef.current();
  }, [isDark]);

  // Leaving Look Up hands the sky over to the page background: a viewport-sized
  // layer re-renders the background's own view of the same snapshot beneath the
  // captured star bitmap, then both rise together while the real background
  // slides in from below. At landing the layer is pixel-identical to the
  // background, so the handover is invisible.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      const rect = skyRectRef.current;
      const snapshot = snapshotRef.current;
      if (!canvas || !rect || !snapshot) return;
      if (window.location.pathname.replace(/\/$/, '') === '/stars-above') return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const mobile = width < MOBILE_BREAKPOINT_PX;
      // Mirrors look-up-arrive's from-offset in globals.css (negated) so the
      // exit retraces the entry path upward.
      const rise = height * (mobile ? 0.35 : 0.3) - rect.top - rect.height / 2;
      const easing = 'cubic-bezier(0.55, 0, 0.85, 0.36)';

      const ghost = document.createElement('div');
      ghost.className = 'look-up-exit-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, { position: 'fixed', inset: '0', zIndex: '5', pointerEvents: 'none' });

      // Bottom layer: the page background's exact rendering of the same sky,
      // pre-offset so it is viewport-aligned at the moment of landing.
      const view = document.createElement('canvas');
      view.className = 'look-up-exit-view';
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      view.width = Math.floor(width * dpr);
      view.height = Math.floor(height * dpr);
      const viewContext = view.getContext('2d');
      if (!viewContext) return;
      viewContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky(viewContext, snapshot, createCamera(width, height, SKY_VIEW,
        mobile ? SKY_CENTER_Y.mobile : SKY_CENTER_Y.desktop), { isDark: isDarkRef.current, mobile });
      Object.assign(view.style, { position: 'absolute', left: '0', top: '0',
        width: `${width}px`, height: `${height}px`, transform: `translateY(${-rise}px)` });

      // Top layer: the captured Look Up star bitmap, dissolving in place.
      const stars = document.createElement('canvas');
      stars.className = 'look-up-exit-stars';
      stars.width = canvas.width;
      stars.height = canvas.height;
      const starContext = stars.getContext('2d');
      if (!starContext) return;
      starContext.drawImage(canvas, 0, 0);
      Object.assign(stars.style, { position: 'absolute', left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px` });

      ghost.append(view, stars);
      document.body.appendChild(ghost);

      const exit = ghost.animate(
        [
          { transform: 'translateY(0px)' },
          { transform: `translateY(${rise}px)` },
        ],
        { duration: 480, easing, fill: 'forwards' },
      );
      stars.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing, fill: 'forwards' });
      document.querySelector('.sky-background')?.animate(
        [
          { transform: `translateY(${-rise}px)` },
          { transform: 'translateY(0px)' },
        ],
        { duration: 480, easing },
      );
      const remove = () => ghost.remove();
      exit.addEventListener('finish', remove);
      exit.addEventListener('cancel', remove);
    };
  }, []);

  const hit = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = sceneRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const radius = event.pointerType === 'mouse' ? LOOK_UP_HIT_RADIUS.mouse : LOOK_UP_HIT_RADIUS.touch;
    return hitTestStar(starsRef.current, event.clientX - bounds.left, event.clientY - bounds.top, radius);
  };
  const activeStars = frame?.stars.filter(({ star }) => pinnedIds.includes(star.id)) ?? [];
  const hoverStar = frame?.stars.find(
    ({ star }) => star.id === hoveredId && !pinnedIds.includes(star.id)) ?? null;

  return (
    <div
      ref={skyRef}
      className="look-up-sky absolute inset-0 overflow-hidden"
      role="region"
      aria-label="South-facing starry sky"
      style={{ cursor: hoveredId !== null ? 'pointer' : 'default' }}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') setHoveredId(hit(event)?.star.id ?? null);
      }}
      onPointerLeave={() => {
        pointerDown.current = null;
        setHoveredId(null);
      }}
      onPointerDown={(event) => {
        if (event.button === 0 && event.isPrimary) pointerDown.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pointerDown.current;
        pointerDown.current = null;
        if (!start || event.button !== 0 || !event.isPrimary ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
        const star = hit(event)?.star;
        if (star) {
          // Removing a pinned name also drops the hover preview, so the name
          // visibly disappears instead of re-appearing under the resting pointer.
          if (pinnedIds.includes(star.id)) setHoveredId(null);
          togglePinned(star.id);
        }
      }}
      onPointerCancel={() => { pointerDown.current = null; }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') clearPinned();
      }}
    >
      <Campfire />
      <div ref={sceneRef} className="look-up-scene absolute inset-0">
      <MeteorBackground maxYFraction={0.9} />
      <canvas ref={canvasRef} aria-hidden="true" className="look-up-stars absolute inset-0 h-full w-full" />
      {frame?.stars.map(({ star, name, point }) => (
        <button
          key={star.id}
          type="button"
          className="look-up-star-focus absolute rounded-full"
          style={{ left: point.x, top: point.y }}
          aria-label={`${name.chinese}, ${name.english}`}
          aria-pressed={pinnedIds.includes(star.id)}
          onFocus={(event) => {
            if (event.currentTarget.matches(':focus-visible')) setHoveredId(star.id);
          }}
          onBlur={() => setHoveredId(null)}
          onClick={(event) => {
            if (event.detail === 0) {
              if (pinnedIds.includes(star.id)) setHoveredId(null);
              togglePinned(star.id);
            }
          }}
        />
      ))}
      <AnimatePresence>
        {frame && activeStars.map((entry) => (
          <StarLabel key={entry.star.id} star={entry} camera={frame.camera} />
        ))}
        {frame && hoverStar && <StarLabel key={`hover-${hoverStar.star.id}`} star={hoverStar} camera={frame.camera} />}
      </AnimatePresence>
      </div>
    </div>
  );
}
