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
import { drawSky, trailHeadPoint, type RenderedStar } from '@/lib/sky/renderer';
import { MOBILE_BREAKPOINT_PX, SKY_CENTER_Y, SKY_UPDATE_INTERVAL_MS, SKY_VIEW } from '@/lib/sky/constants';
import { SPEED_START, TrailBuffer, formatOffset, snapshotAtOffset, speedMultiplier, virtualElapsedMs } from '@/lib/sky/star-trails';
import TrailControls from './TrailControls';
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

  // --- Time travel -----------------------------------------------------------
  // The sky is fast-forwarded by rotating the camera about the celestial pole
  // (see star-trails.ts); the sun and visibility follow the virtual time. While held,
  // the main canvas renders the rotating sky and a second additive canvas
  // accumulates star trails like a long exposure. The accumulated offset
  // persists after release; "now" returns the sky to the present.
  const trailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseCameraRef = useRef<Camera | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const computeRef = useRef<() => void>(() => {});
  const offsetMsRef = useRef(0);
  const trailBufferRef = useRef(new TrailBuffer());
  const cancelTrailFadeRef = useRef<(() => void) | null>(null);
  const starHeadBlendRef = useRef(0);
  const trailPositionBlendRef = useRef(0);
  const trailHeadPositionsRef = useRef<ReadonlyMap<number, RenderedStar['point']>>(new Map());
  const redrawStarsRef = useRef<() => void>(() => {});
  const holdRef = useRef<{
    active: boolean;
    raf: number;
    startTs: number;
    wallPress: number;
    offsetAtStart: number;
    snapshotDate0: number;
    headBlendAtStart: number;
    positionBlendAtStart: number;
    lastShown: number;
    lastShownTs: number;
    onVisibilityChange: (() => void) | null;
  }>({
    active: false, raf: 0, startTs: 0, wallPress: 0, offsetAtStart: 0, snapshotDate0: 0,
    headBlendAtStart: 0, positionBlendAtStart: 0,
    lastShown: -1, lastShownTs: 0, onVisibilityChange: null,
  });
  const [timeTravel, setTimeTravel] = useState<{ holding: boolean; speed: number | null; offsetLabel: string | null }>({
    holding: false, speed: null, offsetLabel: null,
  });
  const [reducedMotion, setReducedMotion] = useState(false);
  const reducedRef = useRef(false);

  const clearTrails = useCallback(() => {
    cancelTrailFadeRef.current?.();
    cancelTrailFadeRef.current = null;
    const trail = trailCanvasRef.current;
    const ctx = trail?.getContext('2d');
    if (trail && ctx) {
      ctx.clearRect(0, 0, trail.width, trail.height);
      trail.style.opacity = '1';
    }
    trailBufferRef.current.clear();
    starHeadBlendRef.current = 0;
    trailPositionBlendRef.current = 0;
    trailHeadPositionsRef.current = new Map();
  }, []);

  const fadeTrails = useCallback(() => {
    const trail = trailCanvasRef.current;
    const ctx = trail?.getContext('2d');
    if (!trail || !ctx) return;
    cancelTrailFadeRef.current?.();
    const duration = reducedRef.current ? 500 : 3500;
    const started = performance.now();
    const initialBlend = starHeadBlendRef.current;
    const initialPositionBlend = trailPositionBlendRef.current;
    let raf = 0;
    const cancel = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    const clear = () => {
      cancel();
      cancelTrailFadeRef.current = null;
      ctx.clearRect(0, 0, trail.width, trail.height);
      trail.style.opacity = '1';
      trailBufferRef.current.clear();
      starHeadBlendRef.current = 0;
      trailPositionBlendRef.current = 0;
      trailHeadPositionsRef.current = new Map();
      redrawStarsRef.current();
    };
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      const remaining = 1 - progress * progress * (3 - 2 * progress);
      trail.style.opacity = `${remaining}`;
      starHeadBlendRef.current = initialBlend * remaining;
      trailPositionBlendRef.current = initialPositionBlend * remaining;
      redrawStarsRef.current();
      if (progress < 1) raf = requestAnimationFrame(tick);
      else clear();
    };
    const timer = window.setTimeout(clear, duration + 700);
    cancelTrailFadeRef.current = cancel;
    raf = requestAnimationFrame(tick);
  }, []);

  const settleExposure = useCallback((rendered: RenderedStar[]) => {
    trailHeadPositionsRef.current = new Map(rendered.map(({ star, point }) => [star.id, point]));
    trailPositionBlendRef.current = 1;
    computeRef.current();
  }, []);

  const drawExposureFrame = useCallback((virtualElapsedFromPress: number) => {
    const base = snapshotRef.current;
    const baseCamera = baseCameraRef.current;
    const hold = holdRef.current;
    const ctx = canvasRef.current?.getContext('2d');
    const trailCtx = trailCanvasRef.current?.getContext('2d');
    if (!base || !baseCamera || !ctx || !trailCtx || !hold.active) return null;
    const virtualNowMs = hold.wallPress + hold.offsetAtStart + virtualElapsedFromPress;
    // Rotate relative to the snapshot's own epoch: correct no matter how stale
    // the last 1x recompute was when the button was pressed.
    const advanceMs = virtualNowMs - hold.snapshotDate0;
    if (advanceMs < 0) return null;
    const frame = snapshotAtOffset(base, baseCamera, advanceMs);
    const progress = Math.min(1, Math.max(0, (performance.now() - hold.startTs) / 180));
    starHeadBlendRef.current = hold.headBlendAtStart +
      (1 - hold.headBlendAtStart) * progress * progress * (3 - 2 * progress);
    trailPositionBlendRef.current = hold.positionBlendAtStart * (1 - progress * progress * (3 - 2 * progress));
    const style = {
      isDark: isDarkRef.current,
      mobile: frame.camera.width < MOBILE_BREAKPOINT_PX,
      presentation: 'look-up' as const,
      trailBlend: starHeadBlendRef.current,
      trailPositionBlend: trailPositionBlendRef.current,
      trailHeadPositions: trailHeadPositionsRef.current,
    };
    const rendered = drawSky(ctx, frame.snapshot, frame.camera, style);
    const exposed = trailPositionBlendRef.current > 0 ? rendered.map(entry => ({
      ...entry,
      point: trailHeadPoint(entry.point, trailHeadPositionsRef.current.get(entry.star.id), trailPositionBlendRef.current),
    })) : rendered;
    trailBufferRef.current.push(virtualNowMs, exposed, frame.snapshot.twilight);
    trailBufferRef.current.draw(trailCtx, style);
    setSnapshotDate(virtualNowMs);
    return exposed;
  }, [setSnapshotDate]);

  const endHold = useCallback(() => {
    const hold = holdRef.current;
    if (!hold.active) return;
    cancelAnimationFrame(hold.raf);
    const virtualMs = virtualElapsedMs(performance.now() - hold.startTs);
    const rendered = drawExposureFrame(virtualMs);
    hold.active = false;
    if (hold.onVisibilityChange) {
      document.removeEventListener('visibilitychange', hold.onVisibilityChange);
      hold.onVisibilityChange = null;
    }
    offsetMsRef.current = hold.offsetAtStart + virtualMs;
    // The snapshot date carries the offset; heads follow the final trail frame
    // until the exposure fades back into the normal star presentation.
    settleExposure(rendered ?? []);
    setTimeTravel({
      holding: false,
      speed: null,
      offsetLabel: offsetMsRef.current ? formatOffset(offsetMsRef.current) : null,
    });
    fadeTrails();
  }, [drawExposureFrame, fadeTrails, settleExposure]);

  // Reduced motion: one static, pre-computed hour of trails; a fade is the only motion.
  const staticExposure = useCallback(() => {
    const base = snapshotRef.current;
    const baseCamera = baseCameraRef.current;
    const trail = trailCanvasRef.current;
    const trailCtx = trail?.getContext('2d');
    const ctx = canvasRef.current?.getContext('2d');
    if (!base || !baseCamera || !trail || !trailCtx || !ctx) return;
    const totalMs = 60 * 60 * 1000;
    const steps = 20;
    const buffer = trailBufferRef.current;
    clearTrails();
    starHeadBlendRef.current = 1;
    let rendered: RenderedStar[] = [];
    for (let i = 1; i <= steps; i += 1) {
      const advanceMs = (totalMs * i) / steps;
      const frame = snapshotAtOffset(base, baseCamera, advanceMs);
      const style = {
        isDark: isDarkRef.current,
        mobile: frame.camera.width < MOBILE_BREAKPOINT_PX,
        presentation: 'look-up' as const,
        trailBlend: 1,
      };
      rendered = drawSky(ctx, frame.snapshot, frame.camera, style);
      buffer.push(base.date.getTime() + advanceMs, rendered, frame.snapshot.twilight);
    }
    buffer.draw(trailCtx, { isDark: isDarkRef.current });
    offsetMsRef.current += totalMs;
    settleExposure(rendered);
    setTimeTravel({ holding: false, speed: null, offsetLabel: formatOffset(offsetMsRef.current) });
    const timer = window.setTimeout(() => {
      cancelTrailFadeRef.current = null;
      fadeTrails();
    }, 6000);
    cancelTrailFadeRef.current = () => window.clearTimeout(timer);
  }, [clearTrails, fadeTrails, settleExposure]);

  const startHold = useCallback(() => {
    const hold = holdRef.current;
    if (hold.active) return;
    const trail = trailCanvasRef.current;
    const trailCtx = trail?.getContext('2d');
    if (!trail || !trailCtx || !snapshotRef.current || !baseCameraRef.current) return;
    if (reducedRef.current) {
      staticExposure();
      return;
    }
    cancelAnimationFrame(hold.raf);
    hold.active = true;
    hold.startTs = performance.now();
    hold.wallPress = dateOverride ?? Date.now();
    hold.offsetAtStart = offsetMsRef.current;
    hold.snapshotDate0 = snapshotRef.current.date.getTime();
    hold.headBlendAtStart = starHeadBlendRef.current;
    hold.positionBlendAtStart = trailPositionBlendRef.current;
    const headPositions = trailHeadPositionsRef.current;
    hold.lastShown = -1;
    hold.lastShownTs = 0;
    clearTrails();
    starHeadBlendRef.current = hold.headBlendAtStart;
    trailPositionBlendRef.current = hold.positionBlendAtStart;
    trailHeadPositionsRef.current = headPositions;
    clearPinned();
    setHoveredId(null);
    setHoveredPreviewId(null);
    setFrame(null);
    setTimeTravel({ holding: true, speed: SPEED_START, offsetLabel: null });
    const step = (ts: number) => {
      const current = holdRef.current;
      if (!current.active) return;
      drawExposureFrame(virtualElapsedMs(ts - current.startTs));
      if (ts - current.lastShownTs >= 120) {
        current.lastShownTs = ts;
        const multiplier = speedMultiplier(ts - current.startTs);
        const shown = multiplier >= 3600 ? 3600 : Math.round(multiplier / 10) * 10;
        if (shown !== current.lastShown) {
          current.lastShown = shown;
          setTimeTravel(state => ({ ...state, speed: shown }));
        }
      }
      current.raf = requestAnimationFrame(step);
    };
    hold.raf = requestAnimationFrame(step);
    hold.onVisibilityChange = () => { if (document.hidden) endHold(); };
    document.addEventListener('visibilitychange', hold.onVisibilityChange);
  }, [clearPinned, clearTrails, dateOverride, drawExposureFrame, endHold, staticExposure]);

  const returnNow = useCallback(() => {
    offsetMsRef.current = 0;
    clearTrails();
    computeRef.current();
    setTimeTravel({ holding: false, speed: null, offsetLabel: null });
  }, [clearTrails]);

  useEffect(() => {
    const sky = skyRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!sky || !canvas || !ctx) return;

    let snapshot: SkySnapshot;
    let computeDurationMs = 0;
    let rafId = 0;
    const compute = () => {
      const started = performance.now();
      snapshot = computeSky(new Date((dateOverride === null ? Date.now() : dateOverride) + offsetMsRef.current), observer, pollution);
      snapshotRef.current = snapshot;
      computeDurationMs = performance.now() - started;
    };
    const drawStars = (camera: Camera) => drawSky(ctx, snapshot, camera, {
      isDark: isDarkRef.current,
      mobile: camera.width < MOBILE_BREAKPOINT_PX,
      presentation: 'look-up',
      trailBlend: starHeadBlendRef.current,
      trailPositionBlend: trailPositionBlendRef.current,
      trailHeadPositions: trailHeadPositionsRef.current,
    });
    const render = () => {
      const camera = cameraRef.current;
      if (!camera || !snapshot) return;
      const started = performance.now();
      const rendered = drawStars(camera);
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
    redrawStarsRef.current = () => {
      const camera = cameraRef.current;
      if (camera && snapshot) drawStars(camera);
    };
    computeRef.current = () => { compute(); render(); };
    reprojectRef.current = () => {
      const previous = baseCameraRef.current;
      if (!previous) return;
      baseCameraRef.current = createLookUpCamera(previous.width, previous.height, facingRef.current);
      cameraRef.current = baseCameraRef.current;
      clearTrails();
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
      const trail = trailCanvasRef.current;
      if (trail) {
        trail.width = canvas.width;
        trail.height = canvas.height;
        const trailCtx = trail.getContext('2d');
        trailCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        trailCtx?.clearRect(0, 0, width, height);
      }
      clearTrails();
      baseCameraRef.current = createLookUpCamera(width, height, facingRef.current);
      cameraRef.current = baseCameraRef.current;
      render();
    };
    const resizeObserver = new ResizeObserver(() => {
      if (holdRef.current.active) endHold();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(resize);
    });

    compute();
    resize();
    resizeObserver.observe(sky);
    const timer = dateOverride === null ? window.setInterval(() => {
      if (holdRef.current.active) return;
      compute();
      render();
    }, SKY_UPDATE_INTERVAL_MS) : null;
    return () => {
      endHold();
      cancelTrailFadeRef.current?.();
      cancelTrailFadeRef.current = null;
      starHeadBlendRef.current = 0;
      trailPositionBlendRef.current = 0;
      trailHeadPositionsRef.current = new Map();
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
      if (timer !== null) window.clearInterval(timer);
      renderRef.current = () => {};
      redrawStarsRef.current = () => {};
      reprojectRef.current = () => {};
    };
  }, [observer, pollution, dateOverride, setSnapshotDate, reconcilePinned, clearTrails, endHold]);

  useLayoutEffect(() => {
    const locationChanged = previousObserverRef.current !== observer;
    if (facingRef.current === facing && !locationChanged) return;
    endHold();
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
  }, [facing, observer, clearPinned, endHold]);

  useEffect(() => {
    isDarkRef.current = isDark;
    renderRef.current();
  }, [isDark]);

  useEffect(() => {
    try { setHintSeen(window.localStorage.getItem('stars-above-star-hint-seen') !== null); }
    catch { setHintSeen(false); }
  }, []);
  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
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
      data-time-holding={timeTravel.holding ? '' : undefined}
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
      <TrailControls
        holding={timeTravel.holding}
        speed={timeTravel.speed}
        offsetLabel={timeTravel.offsetLabel}
        reduced={reducedMotion}
        onHoldStart={startHold}
        onHoldEnd={endHold}
        onReturnNow={returnNow}
      />
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
      <canvas ref={trailCanvasRef} aria-hidden="true" className="look-up-trails absolute inset-0 h-full w-full" />
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
