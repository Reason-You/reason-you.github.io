'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import MeteorBackground from '@/components/ui/MeteorBackground';
import { useSkyStore } from '@/lib/stores/skyStore';
import { useLabelStore } from '@/lib/stores/labelStore';
import Campfire from './Campfire';
import CampfireLog from './CampfireLog';
import ConstellationPreview from './ConstellationPreview';
import StarLabels from './StarLabels';
import { useSkyDirection } from './SkyDirection';
import { resolveTheme, useThemeStore } from '@/lib/stores/themeStore';
import { computeSky, type SkySnapshot } from '@/lib/sky/astro';
import { createCamera, type Camera } from '@/lib/sky/projection';
import { drawSky, type RenderedStar } from '@/lib/sky/renderer';
import { MOBILE_BREAKPOINT_PX, SKY_CENTER_Y, SKY_UPDATE_INTERVAL_MS, SKY_VIEW } from '@/lib/sky/constants';
import { constellationHitTargets, readConstellationPreview } from '@/lib/sky/constellations';
import {
  createLookUpCamera, hitTestStar, interactiveStars, LOOK_UP_HIT_RADIUS,
  SKY_DIRECTIONS, type InteractiveStar,
} from '@/lib/sky/look-up';

interface SkyFrame {
  camera: Camera;
  snapshot: SkySnapshot;
  rendered: RenderedStar[];
  stars: InteractiveStar[];
}

export default function LookUpSky() {
  const skyRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directionLayerRef = useRef<HTMLDivElement>(null);
  const previousLayerRef = useRef<HTMLDivElement>(null);
  const { facing } = useSkyDirection();
  const facingRef = useRef(facing);
  const reprojectRef = useRef<() => void>(() => {});
  const skyRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const snapshotRef = useRef<SkySnapshot | null>(null);
  const starsRef = useRef<InteractiveStar[]>([]);
  const previewStarsRef = useRef<RenderedStar[]>([]);
  const visibleStarsRef = useRef<RenderedStar[]>([]);
  const pointerStarRef = useRef<number | null>(null);
  const suppressedStarRef = useRef<number | null>(null);
  const previousPinCount = useRef(0);
  const renderRef = useRef<() => void>(() => {});
  const theme = useThemeStore((state) => state.theme);
  const isDark = resolveTheme(theme) === 'dark';
  const isDarkRef = useRef(isDark);
  const observer = useSkyStore((state) => state.observer);
  const previousObserverRef = useRef(observer);
  const pollution = useSkyStore((state) => state.pollution);
  const dateOverride = useSkyStore((state) => state.dateOverride);
  const setSnapshotDate = useSkyStore((state) => state.setSnapshotDate);
  const [frame, setFrame] = useState<SkyFrame | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredPreviewId, setHoveredPreviewId] = useState<number | null>(null);
  const [hintSeen, setHintSeen] = useState(true);
  const pinnedIds = useLabelStore((state) => state.pinnedIds);
  const pinnedConstellations = useLabelStore((state) => state.constellationIds);
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
      const previewStars = readConstellationPreview(new URLSearchParams(window.location.search).get('constellationPreview')) === null
        ? [] : constellationHitTargets(rendered, snapshot.constellationStars, camera);
      previewStarsRef.current = previewStars;
      visibleStarsRef.current = rendered.filter(({ point }) => point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height);
      setFrame({ camera, snapshot, rendered, stars });

      if (new URLSearchParams(window.location.search).has('skydebug')) {
        (window as unknown as Record<string, unknown>).__sky = {
          observer: snapshot.observer,
          lightPollution: snapshot.pollution,
          snapshot, camera, rendered, interactiveStars: stars, facing: facingRef.current,
          computeDurationMs, renderDurationMs: performance.now() - started,
        };
      }
    };
    renderRef.current = render;
    reprojectRef.current = () => {
      if (!camera) return;
      camera = createLookUpCamera(camera.width, camera.height, facingRef.current);
      render();
    };
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
      camera = createLookUpCamera(width, height, facingRef.current);
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
      reprojectRef.current = () => {};
    };
  }, [observer, pollution, dateOverride, setSnapshotDate, reconcilePinned]);

  useLayoutEffect(() => {
    const locationChanged = previousObserverRef.current !== observer;
    if (facingRef.current === facing && !locationChanged) return;
    previousObserverRef.current = observer;
    facingRef.current = facing;
    setHoveredId(null);
    setHoveredPreviewId(null);
    pointerStarRef.current = null;
    suppressedStarRef.current = null;
    pointerDown.current = null;
    clearPinned();
    const layer = directionLayerRef.current;
    const previous = previousLayerRef.current;
    const canvas = canvasRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (layer && previous && canvas && !reduced) {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.className = 'absolute inset-0 h-full w-full';
      copy.getContext('2d')?.drawImage(canvas, 0, 0);
      previous.replaceChildren(copy);
    }
    if (!locationChanged) reprojectRef.current();
    if (!layer || !previous || reduced) return;
    const duration = locationChanged ? 420 : 300;
    const incoming = layer.animate([
      { opacity: 0, transform: locationChanged ? 'scale(0.985)' : 'none' },
      { opacity: 1, transform: 'none' },
    ], { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    const outgoing = previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-out' });
    outgoing.onfinish = () => previous.replaceChildren();
    return () => {
      incoming.cancel();
      outgoing.cancel();
      previous.replaceChildren();
    };
  }, [facing, observer, clearPinned]);

  useEffect(() => {
    isDarkRef.current = isDark;
    renderRef.current();
  }, [isDark]);

  useEffect(() => {
    try { setHintSeen(window.localStorage.getItem('stars-above-star-hint-seen') !== null); }
    catch { setHintSeen(false); }
  }, []);
  const acknowledgeStar = useCallback(() => {
    setHintSeen(true);
    try { window.localStorage.setItem('stars-above-star-hint-seen', '1'); }
    catch { /* The hint remains acknowledged for this visit. */ }
  }, []);
  const hintVisible = !hintSeen && (frame?.stars.length ?? 0) > 0;

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

  useEffect(() => {
    setHoveredId(null);
    setHoveredPreviewId(null);
    pointerStarRef.current = null;
    suppressedStarRef.current = null;
  }, [frame?.camera, frame?.snapshot]);

  useEffect(() => {
    if (previousPinCount.current > 0 && pinnedIds.length === 0) {
      suppressedStarRef.current = pointerStarRef.current;
      setHoveredId(null);
      setHoveredPreviewId(null);
    }
    previousPinCount.current = pinnedIds.length;
  }, [pinnedIds.length]);

  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      suppressedStarRef.current = pointerStarRef.current;
      setHoveredId(null);
      setHoveredPreviewId(null);
      clearPinned();
    };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [clearPinned]);

  const hit = (event: PointerEvent<HTMLDivElement>, stars: readonly RenderedStar[] = starsRef.current) => {
    const bounds = sceneRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const radius = event.pointerType === 'mouse' ? LOOK_UP_HIT_RADIUS.mouse : LOOK_UP_HIT_RADIUS.touch;
    return hitTestStar(stars, event.clientX - bounds.left, event.clientY - bounds.top, radius);
  };
  const hitNamed = (event: PointerEvent<HTMLDivElement>) => {
    const nearest = hit(event, visibleStarsRef.current);
    return starsRef.current.find(entry => entry.star.id === nearest?.star.id) ?? null;
  };
  const toggleNamedStar = (id: number) => {
    if (pinnedIds.includes(id)) {
      suppressedStarRef.current = id;
      setHoveredId(null);
      setHoveredPreviewId(null);
    }
    togglePinned(id);
  };
  const activeStars = frame?.stars.filter(({ star }) => pinnedIds.includes(star.id)) ?? [];
  const hoverStar = frame?.stars.find(
    ({ star }) => star.id === hoveredId && !pinnedIds.includes(star.id)) ?? null;

  return (
    <div
      ref={skyRef}
      className="look-up-sky absolute inset-0 overflow-hidden"
      role="region"
      aria-label={`${SKY_DIRECTIONS[facing].name}-facing starry sky`}
      style={{ cursor: hoveredId !== null ? 'pointer' : 'default' }}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') {
          const namedId = hitNamed(event)?.star.id ?? null;
          const previewId = hit(event, previewStarsRef.current)?.star.id ?? null;
          const targetId = previewId ?? namedId;
          pointerStarRef.current = targetId;
          if (targetId !== suppressedStarRef.current) suppressedStarRef.current = null;
          setHoveredId(namedId === suppressedStarRef.current ? null : namedId);
          setHoveredPreviewId(previewId === suppressedStarRef.current ? null : previewId);
        }
      }}
      onPointerLeave={() => {
        pointerDown.current = null;
        setHoveredId(null);
        setHoveredPreviewId(null);
        pointerStarRef.current = null;
        suppressedStarRef.current = null;
      }}
      onPointerDown={(event) => {
        if (event.button === 0 && event.isPrimary) pointerDown.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pointerDown.current;
        pointerDown.current = null;
        if (!start || event.button !== 0 || !event.isPrimary ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
        const star = hitNamed(event)?.star;
        if (star) toggleNamedStar(star.id);
      }}
      onPointerCancel={() => { pointerDown.current = null; }}
    >
      <Campfire />
      <CampfireLog skyHeight={frame?.camera.height} />
      <div
        aria-hidden="true"
        className={`look-up-star-hint pointer-events-none absolute z-20 left-4 bottom-[120px] sm:left-6 sm:bottom-[100px] text-xs text-neutral-500 transition-opacity duration-[400ms] ${hintVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="look-up-star-hint-hover">Hover over a bright star</span>
        <span className="look-up-star-hint-tap">Tap a bright star</span>
      </div>
      {pinnedIds.length > 0 && (
        <button
          type="button"
          className="sky-clear-names absolute right-4 bottom-5 sm:right-6 sm:bottom-6 z-30 text-xs text-neutral-500 hover:text-accent transition-colors duration-200 rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            suppressedStarRef.current = pointerStarRef.current;
            setHoveredId(null);
            setHoveredPreviewId(null);
            clearPinned();
          }}
        >
          Clear names
        </button>
      )}
      <div ref={sceneRef} className="look-up-scene absolute inset-0">
      <MeteorBackground maxYFraction={0.9} />
      <div ref={directionLayerRef} className="look-up-direction absolute inset-0">
      {frame && <Suspense fallback={null}>
        <ConstellationPreview
          key={`${facing}:${frame.camera.width}:${frame.camera.height}:${frame.snapshot.date.getTime()}:${frame.snapshot.observer.latitude}:${frame.snapshot.observer.longitude}:${frame.snapshot.pollution.limitingMagnitude}`}
          starId={hoveredPreviewId} selectedStarIds={pinnedIds} pinnedConstellations={pinnedConstellations}
          rendered={frame.rendered} constellationStars={frame.snapshot.constellationStars}
          camera={frame.camera} skyRef={skyRef} sceneRef={sceneRef} />
      </Suspense>}
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
            if (event.currentTarget.matches(':focus-visible')) {
              pointerStarRef.current = star.id;
              suppressedStarRef.current = null;
              setHoveredId(star.id);
              setHoveredPreviewId(star.id);
            }
          }}
          onBlur={() => {
            setHoveredId(null); setHoveredPreviewId(null);
            pointerStarRef.current = null; suppressedStarRef.current = null;
          }}
          onClick={(event) => {
            if (event.detail === 0) toggleNamedStar(star.id);
          }}
        />
      ))}
      {frame && <StarLabels stars={hoverStar ? [...activeStars, hoverStar] : activeStars}
        camera={frame.camera} skyRef={skyRef} sceneRef={sceneRef} onDisplay={acknowledgeStar} />}
      </div>
      <div ref={previousLayerRef} aria-hidden="true" className="look-up-previous absolute inset-0 pointer-events-none" />
      </div>
    </div>
  );
}
