'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Check, Grid2X2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import MeteorBackground from '@/components/ui/MeteorBackground';
import { selectSkyPollution, useSkyStore } from '@/lib/stores/skyStore';
import { useLabelStore } from '@/lib/stores/labelStore';
import Campfire from './Campfire';
import CampfireLog from './CampfireLog';
import ConstellationPreview from './ConstellationPreview';
import StarLabels from './StarLabels';
import { useSkyDirection } from './SkyDirection';
import { resolveTheme, useThemeStore } from '@/lib/stores/themeStore';
import { computeSky, createSkyComputation, solarSkyState, type SkySnapshot } from '@/lib/sky/astro';
import type { LightPollution } from '@/lib/sky/lightPollution';
import { createCamera, projectSkyDirection, unprojectSkyPoint, type Camera, type SkyDirectionVector } from '@/lib/sky/projection';
import { drawSky, projectSkyStars, trailHeadPoint, type RenderedStar } from '@/lib/sky/renderer';
import { MOBILE_BREAKPOINT_PX, SKY_CENTER_Y, SKY_UPDATE_INTERVAL_MS, SKY_VIEW } from '@/lib/sky/constants';
import { SPEED_START, SPEED_MAX, TRAIL_HOLD_MS, TRAIL_FADE_MS, TrailBuffer, cameraAtOffset, formatOffset, snapshotAtOffset, speedMultiplier, virtualElapsedMs, zenithAtOffset } from '@/lib/sky/star-trails';
import TrailControls from './TrailControls';
import SkyGuides from './SkyGuides';
import SkyViewControls from './SkyViewControls';
import { SkyHintsProvider } from './SkyHints';
import { drawSkyGuides } from '@/lib/sky/guides';
import { horizonScreenY, projectCampfire } from '@/lib/sky/ground';
import { drawGround } from '@/lib/sky/ground-renderer';
import { constellationHitTargets, readConstellationPreview } from '@/lib/sky/constellations';
import {
  createLookUpCamera, directionName, dragSkyView, hitTestStar, interactiveStars, LOOK_UP_HIT_RADIUS,
  type InteractiveStar, type SkyView,
} from '@/lib/sky/look-up';

interface SkyFrame {
  camera: Camera;
  snapshot: SkySnapshot;
  horizon: readonly number[];
  rendered: RenderedStar[];
  stars: InteractiveStar[];
  groundY: number;
}

const PAN_FRAME_BUDGET_MS = 1000 / 50;
const SLOWER_PAN_FRAME_MS = 1000 / 30;
const SLOW_PAN_FRAMES = 3;

interface RetainedTrailFrame {
  camera: Camera;
  isDark: boolean;
  maxMagnitude: number;
  restoreRaf: number;
}

export default function LookUpSky() {
  const skyRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const groundCanvasRef = useRef<HTMLCanvasElement>(null);
  const directionLayerRef = useRef<HTMLDivElement>(null);
  const previousLayerRef = useRef<HTMLDivElement>(null);
  const { facing, view, setView, fitViewport } = useSkyDirection();
  const [skySize, setSkySize] = useState<{ width: number; height: number } | null>(null);
  const localCamera = useMemo(() => skySize
    ? createLookUpCamera(skySize.width, skySize.height, view) : null, [skySize, view]);
  const facingRef = useRef(facing);
  const viewRef = useRef(view);
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
  const groundColorRef = useRef(isDark ? '#0f172a' : '#fefffe');
  const observer = useSkyStore(useShallow((state) => state.observer));
  const previousObserverRef = useRef(observer);
  const pollution = useSkyStore(selectSkyPollution);
  const skyLookMode = useSkyStore(state => state.skyLookMode);
  const previousLookMode = useRef(skyLookMode);
  const cityLimit = useSkyStore(state => state.skyLookMode === 'ideal' ? state.pollution.limitingMagnitude : undefined);
  const pollutionRef = useRef(pollution);
  const dateOverride = useSkyStore((state) => state.dateOverride);
  const backToLive = useSkyStore(state => state.backToLive);
  const setSnapshotDate = useSkyStore((state) => state.setSnapshotDate);
  const [frame, setFrame] = useState<SkyFrame | null>(null);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const guidesOpenRef = useRef(false);
  const guidesCanvasRef = useRef<HTMLCanvasElement>(null);
  const guideFrameRef = useRef<{
    snapshot: SkySnapshot; camera: Camera; horizon?: readonly number[]; timestamp: number;
  } | null>(null);
  const guidePaintRef = useRef<{
    snapshot: SkySnapshot; camera: Camera | null; second: number; isDark: boolean;
  } | null>(null);
  const groundPaintRef = useRef<{
    camera: Camera; twilight: number; isDark: boolean; color: string;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredPreviewId, setHoveredPreviewId] = useState<number | null>(null);
  const pinnedIds = useLabelStore((state) => state.pinnedIds);
  const pinnedConstellations = useLabelStore((state) => state.constellationIds);
  const togglePinned = useLabelStore((state) => state.toggle);
  const clearPinned = useLabelStore((state) => state.clearAll);
  const reconcilePinned = useLabelStore((state) => state.reconcile);
  const pointerDown = useRef<{
    id: number; x: number; y: number; view: SkyView; camera: Camera;
    dragging: boolean; latestView: SkyView;
    slowFrames: number[]; magnitudeLimit: number;
  } | null>(null);
  const draggingRef = useRef(false);
  const panRafRef = useRef(0);
  const starDetailLimitRef = useRef(Infinity);
  const starDetailTimerRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const restoreStarDetail = useCallback((delay = 320) => {
    window.clearTimeout(starDetailTimerRef.current);
    starDetailTimerRef.current = window.setTimeout(() => {
      starDetailTimerRef.current = 0;
      starDetailLimitRef.current = Infinity;
      if (!holdRef.current.active) renderRef.current();
    }, delay);
  }, []);

  const finishPan = useCallback((applyPending = true) => {
    const pointer = pointerDown.current;
    pointerDown.current = null;
    cancelAnimationFrame(panRafRef.current);
    panRafRef.current = 0;
    draggingRef.current = false;
    if (pointer?.dragging) {
      setDragging(false);
      const viewChanged = viewRef.current.azimuth !== pointer.latestView.azimuth ||
        viewRef.current.altitude !== pointer.latestView.altitude;
      if (applyPending) {
        viewRef.current = pointer.latestView;
        setView(pointer.latestView);
      }
      if (applyPending && viewChanged) reprojectRef.current();
      else renderRef.current();
    }
    if (pointer && skyRef.current?.hasPointerCapture(pointer.id)) skyRef.current.releasePointerCapture(pointer.id);
    return Boolean(pointer?.dragging);
  }, [setView]);

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
  const recomputeSnapshotRef = useRef<() => void>(() => {});
  const prepareSkyRef = useRef<(
    target: LightPollution, cityLimitingMagnitude: number | undefined, onReady: () => void,
  ) => () => void>(() => () => {});
  const skyPreparationRef = useRef<object | null>(null);
  const lightingLayerRef = useRef<{ canvas: HTMLCanvasElement; fade?: Animation } | null>(null);
  const trailBufferRef = useRef(new TrailBuffer());
  const cancelTrailFadeRef = useRef<(() => void) | null>(null);
  const starHeadBlendRef = useRef(0);
  const trailPositionBlendRef = useRef(0);
  const trailHeadPositionsRef = useRef(new Map<number, RenderedStar['point']>());
  const trailHeadDirectionsRef = useRef<ReadonlyMap<number, SkyDirectionVector>>(new Map());
  const trailAnchorFrameRef = useRef<{
    camera: Camera; directions: ReadonlyMap<number, SkyDirectionVector>;
  } | null>(null);
  const trailHeadSettleRafRef = useRef(0);
  const retainedTrailFrameRef = useRef<RetainedTrailFrame | null>(null);
  const trailContextRef = useRef({ observer, dateOverride });
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
  const [trailsActive, setTrailsActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const reducedRef = useRef(false);

  const removeLightingLayer = useCallback(() => {
    const layer = lightingLayerRef.current;
    lightingLayerRef.current = null;
    layer?.fade?.cancel();
    layer?.canvas.remove();
  }, []);

  const revealLighting = useCallback(() => {
    const layer = lightingLayerRef.current;
    if (!layer || layer.fade) return;
    if (reducedRef.current) { removeLightingLayer(); return; }
    layer.fade = layer.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
    layer.fade.onfinish = () => { if (lightingLayerRef.current === layer) removeLightingLayer(); };
  }, [removeLightingLayer]);

  const renderGuides = useCallback((snapshot: SkySnapshot, camera: Camera, horizon?: readonly number[], force = false, timestamp = snapshot.date.getTime()) => {
    const isDark = isDarkRef.current;
    guideFrameRef.current = { snapshot, camera, horizon, timestamp };
    if (!guidesOpenRef.current) return;
    const localCamera = baseCameraRef.current;
    const second = Math.floor(timestamp / 1000);
    const previous = guidePaintRef.current;
    if (!force && previous?.snapshot === snapshot && previous.camera === localCamera &&
        previous.second === second && previous.isDark === isDark) return;
    const ctx = guidesCanvasRef.current?.getContext('2d');
    if (ctx) {
      drawSkyGuides(ctx, snapshot.date, snapshot.observer, camera, { isDark, horizon });
      guidePaintRef.current = { snapshot, camera: localCamera, second, isDark };
    }
  }, []);

  const renderGround = useCallback((twilight: number) => {
    const camera = baseCameraRef.current;
    const ctx = groundCanvasRef.current?.getContext('2d');
    if (!camera || !ctx) return;
    const isDark = isDarkRef.current;
    const color = groundColorRef.current;
    const previous = groundPaintRef.current;
    if (previous?.camera === camera && previous.twilight === twilight && previous.isDark === isDark && previous.color === color) return;
    drawGround(ctx, camera, isDark, twilight, color);
    groundPaintRef.current = { camera, twilight, isDark, color };
  }, []);

  const refreshTrailAnchors = useCallback((camera: Camera, visible: readonly RenderedStar[]) => {
    const directions = trailHeadDirectionsRef.current;
    if (!directions.size) return;
    const previous = trailAnchorFrameRef.current;
    if (previous?.camera !== camera || previous.directions !== directions) {
      trailHeadPositionsRef.current = new Map();
      trailAnchorFrameRef.current = { camera, directions };
    }
    const positions = trailHeadPositionsRef.current;
    for (const { star } of visible) {
      if (positions.has(star.id)) continue;
      const direction = directions.get(star.id);
      if (!direction) continue;
      const point = projectSkyDirection(direction, camera);
      if (point) positions.set(star.id, point);
    }
  }, []);

  const renderRetainedTrails = useCallback(() => {
    const camera = baseCameraRef.current;
    const buffer = trailBufferRef.current;
    const previous = retainedTrailFrameRef.current;
    if (!camera || holdRef.current.active || (!buffer.hasTrails() && !previous)) return;
    const isDark = isDarkRef.current;
    const pan = pointerDown.current?.dragging ? pointerDown.current : null;
    let frame = previous?.camera === camera && previous.isDark === isDark ? previous : null;
    if (frame?.maxMagnitude === Infinity) return;
    if (frame && (pan || frame.restoreRaf)) return;
    const ctx = trailCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const style = { isDark, camera };
    if (!frame) {
      if (previous?.restoreRaf) cancelAnimationFrame(previous.restoreRaf);
      // Keep the current bright-star selection when another drag interrupts restoration.
      const limit = Math.min(previous?.maxMagnitude ?? Infinity, pan?.magnitudeLimit ?? Infinity);
      const complete = buffer.draw(ctx, style, limit);
      frame = { ...style, maxMagnitude: complete ? Infinity : limit, restoreRaf: 0 };
      retainedTrailFrameRef.current = frame;
    }
    if (frame.maxMagnitude === Infinity) return;
    if (pan) return;
    const pending = frame;
    const restore = () => {
      pending.restoreRaf = 0;
      if (retainedTrailFrameRef.current !== pending || draggingRef.current) return;
      if (buffer.draw(ctx, style, 'restore')) {
        pending.maxMagnitude = Infinity;
      } else pending.restoreRaf = requestAnimationFrame(restore);
    };
    pending.restoreRaf = requestAnimationFrame(restore);
  }, []);

  const clearTrails = useCallback((preserveLightingLayer = false) => {
    if (!preserveLightingLayer) removeLightingLayer();
    cancelAnimationFrame(trailHeadSettleRafRef.current);
    trailHeadSettleRafRef.current = 0;
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
    trailHeadDirectionsRef.current = new Map();
    if (retainedTrailFrameRef.current?.restoreRaf) cancelAnimationFrame(retainedTrailFrameRef.current.restoreRaf);
    retainedTrailFrameRef.current = null;
    setTrailsActive(false);
  }, [removeLightingLayer]);

  const fadeTrails = useCallback(() => {
    const trail = trailCanvasRef.current;
    const ctx = trail?.getContext('2d');
    if (!trail || !ctx) return;
    cancelTrailFadeRef.current?.();
    const duration = TRAIL_FADE_MS;
    let started = 0;
    const initialBlend = starHeadBlendRef.current;
    const initialPositionBlend = trailPositionBlendRef.current;
    let raf = 0;
    let clearTimer = 0;
    const cancel = () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(clearTimer);
      cancelAnimationFrame(raf);
    };
    const clear = () => {
      clearTrails();
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
    const holdTimer = window.setTimeout(() => {
      started = performance.now();
      raf = requestAnimationFrame(tick);
      clearTimer = window.setTimeout(clear, duration + 700);
    }, TRAIL_HOLD_MS);
    cancelTrailFadeRef.current = cancel;
  }, [clearTrails]);

  const settleExposure = useCallback((rendered: RenderedStar[]) => {
    cancelAnimationFrame(trailHeadSettleRafRef.current);
    trailHeadSettleRafRef.current = 0;
    const camera = baseCameraRef.current;
    const directions = new Map(trailBufferRef.current.headDirections());
    trailHeadDirectionsRef.current = directions;
    if (camera && trailPositionBlendRef.current > 0 && rendered.length) {
      const starts = rendered.map(({ star, point }) => [star.id, unprojectSkyPoint(point, camera)] as const);
      const initial = new Map(directions);
      for (const [id, direction] of starts) initial.set(id, direction);
      trailHeadDirectionsRef.current = initial;
      const started = performance.now();
      const settle = (now: number) => {
        const progress = Math.min(1, (now - started) / 180);
        const blend = progress * progress * (3 - 2 * progress);
        const next = new Map(directions);
        if (progress < 1) {
          for (const [id, from] of starts) {
            const to = directions.get(id);
            if (!to) continue;
            const x = from[0] + (to[0] - from[0]) * blend;
            const y = from[1] + (to[1] - from[1]) * blend;
            const z = from[2] + (to[2] - from[2]) * blend;
            const length = Math.hypot(x, y, z);
            next.set(id, [x / length, y / length, z / length]);
          }
        }
        trailHeadDirectionsRef.current = next;
        renderRef.current();
        trailHeadSettleRafRef.current = progress < 1 ? requestAnimationFrame(settle) : 0;
      };
      trailHeadSettleRafRef.current = requestAnimationFrame(settle);
    }
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
      // Keep the below-horizon collar so trails cross the opaque ground edge.
      horizonY: Infinity,
      trailBlend: starHeadBlendRef.current,
      trailPositionBlend: trailPositionBlendRef.current,
      trailHeadPositions: trailHeadPositionsRef.current,
    };
    const rendered = drawSky(ctx, frame.snapshot, frame.camera, style);
    const exposed = trailPositionBlendRef.current > 0 ? rendered.map(entry => ({
      ...entry,
      point: trailHeadPoint(entry.point, trailHeadPositionsRef.current.get(entry.star.id), trailPositionBlendRef.current),
    })) : rendered;
    trailBufferRef.current.push(virtualNowMs, frame.snapshot.twilight);
    trailBufferRef.current.draw(trailCtx, { ...style, camera: baseCamera });
    renderGuides(base, frame.camera, zenithAtOffset(base.observer.latitude, advanceMs), false, virtualNowMs);
    renderGround(frame.snapshot.twilight);
    setSnapshotDate(virtualNowMs, virtualNowMs - (dateOverride ?? Date.now()));
    return exposed;
  }, [dateOverride, renderGuides, renderGround, setSnapshotDate]);

  const stopHold = useCallback(() => {
    const hold = holdRef.current;
    cancelAnimationFrame(hold.raf);
    hold.active = false;
    if (hold.onVisibilityChange) {
      document.removeEventListener('visibilitychange', hold.onVisibilityChange);
      hold.onVisibilityChange = null;
    }
  }, []);

  const endHold = useCallback(() => {
    const hold = holdRef.current;
    if (!hold.active) return;
    const virtualMs = virtualElapsedMs(performance.now() - hold.startTs);
    const rendered = drawExposureFrame(virtualMs);
    stopHold();
    const offsetMs = hold.wallPress + hold.offsetAtStart + virtualMs - (dateOverride ?? Date.now());
    useSkyStore.getState().setTimeOffset(offsetMs);
    // The snapshot date carries the offset; heads follow the final trail frame
    // until the exposure fades back into the normal star presentation.
    settleExposure(rendered ?? []);
    setTimeTravel({
      holding: false,
      speed: null,
      offsetLabel: offsetMs ? formatOffset(offsetMs) : null,
    });
    fadeTrails();
  }, [dateOverride, drawExposureFrame, fadeTrails, settleExposure, stopHold]);

  const finishHoldForLightingChange = useCallback(() => {
    const hold = holdRef.current;
    if (!hold.active) return;
    const virtualMs = virtualElapsedMs(performance.now() - hold.startTs);
    const timestamp = hold.wallPress + hold.offsetAtStart + virtualMs;
    const offsetMs = timestamp - (dateOverride ?? Date.now());
    stopHold();
    setSnapshotDate(timestamp, offsetMs);
    setTimeTravel({ holding: false, speed: null, offsetLabel: offsetMs ? formatOffset(offsetMs) : null });
  }, [dateOverride, setSnapshotDate, stopHold]);

  // Reduced motion: one static, pre-computed hour of trails; a fade is the only motion.
  const staticExposure = useCallback(() => {
    recomputeSnapshotRef.current();
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
    setTrailsActive(true);
    buffer.begin(base, base.date.getTime());
    starHeadBlendRef.current = 1;
    for (let i = 1; i <= steps; i += 1) {
      const timestamp = base.date.getTime() + totalMs * i / steps;
      buffer.push(timestamp, solarSkyState(new Date(timestamp), base.observer).twilight);
    }
    buffer.draw(trailCtx, { isDark: isDarkRef.current, camera: baseCamera });
    const offsetMs = base.date.getTime() + totalMs - (dateOverride ?? Date.now());
    useSkyStore.getState().setTimeOffset(offsetMs);
    settleExposure([]);
    setTimeTravel({ holding: false, speed: null, offsetLabel: formatOffset(offsetMs) });
    fadeTrails();
  }, [clearTrails, dateOverride, fadeTrails, settleExposure]);

  const startHold = useCallback((): boolean => {
    const hold = holdRef.current;
    if (hold.active || draggingRef.current || skyPreparationRef.current) return false;
    const trail = trailCanvasRef.current;
    const trailCtx = trail?.getContext('2d');
    if (!trail || !trailCtx || !snapshotRef.current || !baseCameraRef.current) return false;
    if (reducedRef.current) {
      staticExposure();
      return true;
    }
    cancelAnimationFrame(hold.raf);
    hold.active = true;
    hold.startTs = performance.now();
    hold.wallPress = dateOverride ?? Date.now();
    hold.offsetAtStart = useSkyStore.getState().timeOffsetMs;
    hold.snapshotDate0 = snapshotRef.current.date.getTime();
    hold.headBlendAtStart = starHeadBlendRef.current;
    hold.positionBlendAtStart = trailPositionBlendRef.current;
    const headPositions = trailHeadPositionsRef.current;
    const headDirections = trailHeadDirectionsRef.current;
    hold.lastShown = -1;
    hold.lastShownTs = 0;
    clearTrails();
    setTrailsActive(true);
    trailBufferRef.current.begin(snapshotRef.current, hold.wallPress + hold.offsetAtStart);
    starHeadBlendRef.current = hold.headBlendAtStart;
    trailPositionBlendRef.current = hold.positionBlendAtStart;
    trailHeadPositionsRef.current = headPositions;
    trailHeadDirectionsRef.current = headDirections;
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
        const shown = Math.min(SPEED_MAX, Math.round(multiplier / 10) * 10);
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
    return true;
  }, [clearPinned, clearTrails, dateOverride, drawExposureFrame, endHold, staticExposure]);

  const returnNow = useCallback(() => {
    useSkyStore.getState().setTimeOffset(0);
    clearTrails();
    if (skyPreparationRef.current) renderRef.current();
    else computeRef.current();
    setTimeTravel({ holding: false, speed: null, offsetLabel: null });
  }, [clearTrails]);

  useEffect(() => {
    const sky = skyRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!sky || !canvas || !ctx) return;

    const previousContext = trailContextRef.current;
    if (previousContext.observer !== observer || previousContext.dateOverride !== dateOverride) {
      clearTrails();
      const offset = useSkyStore.getState().timeOffsetMs;
      setTimeTravel({ holding: false, speed: null, offsetLabel: offset ? formatOffset(offset) : null });
    }
    trailContextRef.current = { observer, dateOverride };

    let snapshot: SkySnapshot;
    let timeFrameCache: {
      base: SkySnapshot; timestamp: number; snapshot: SkySnapshot; horizon: readonly number[];
      sourceCamera: Camera; camera: Camera;
    } | null = null;
    let widestSky: SkySnapshot | null = null;
    let computeDurationMs = 0;
    let rafId = 0;
    const compute = () => {
      const started = performance.now();
      snapshot = computeSky(new Date((dateOverride ?? Date.now()) + useSkyStore.getState().timeOffsetMs), observer, pollutionRef.current);
      const state = useSkyStore.getState();
      if (state.skyLookMode === 'ideal') snapshot.cityLimitingMagnitude = state.pollution.limitingMagnitude;
      snapshotRef.current = snapshot;
      if (!widestSky || snapshot.pollution.limitingMagnitude >= widestSky.pollution.limitingMagnitude) widestSky = snapshot;
      computeDurationMs = performance.now() - started;
    };
    prepareSkyRef.current = (target, targetCityLimit, onReady) => {
      const token = {};
      skyPreparationRef.current = token;
      let cancelled = false;
      let frameId = 0;
      let spentMs = 0;
      const publish = (prepared: SkySnapshot) => {
        if (cancelled || skyPreparationRef.current !== token) return;
        skyPreparationRef.current = null;
        snapshot = prepared;
        snapshotRef.current = prepared;
        computeDurationMs = spentMs;
        onReady();
      };
      const cached = widestSky && widestSky.pollution.limitingMagnitude >= target.limitingMagnitude
        ? widestSky : null;
      if (cached) {
        const limit = target.limitingMagnitude;
        const narrower = limit < cached.pollution.limitingMagnitude;
        const prepared = {
          ...cached,
          pollution: target,
          cityLimitingMagnitude: targetCityLimit,
          celestialStars: narrower ? cached.celestialStars.filter(star => star.mag <= limit) : cached.celestialStars,
          stars: narrower ? cached.stars.filter(star => star.mag <= limit) : cached.stars,
        };
        frameId = requestAnimationFrame(() => publish(prepared));
      } else {
        const timestamp = new Date((dateOverride ?? Date.now()) + useSkyStore.getState().timeOffsetMs);
        const computation = createSkyComputation(timestamp, observer, target);
        const step = () => {
          const started = performance.now();
          const prepared = computation.runFor(4);
          spentMs += performance.now() - started;
          if (!prepared) {
            frameId = requestAnimationFrame(step);
            return;
          }
          prepared.cityLimitingMagnitude = targetCityLimit;
          if (!widestSky || prepared.pollution.limitingMagnitude >= widestSky.pollution.limitingMagnitude) widestSky = prepared;
          publish(prepared);
        };
        frameId = requestAnimationFrame(step);
      }
      return () => {
        cancelled = true;
        if (skyPreparationRef.current === token) skyPreparationRef.current = null;
        cancelAnimationFrame(frameId);
      };
    };
    const currentFrame = () => {
      const camera = cameraRef.current;
      if (!camera || !snapshot) return null;
      const liveTimestamp = (dateOverride ?? Date.now()) + useSkyStore.getState().timeOffsetMs;
      // Human-scale interaction does not need the horizon subset rebuilt more than once per second.
      const timestamp = snapshot.date.getTime() + Math.floor((liveTimestamp - snapshot.date.getTime()) / 1000) * 1000;
      const advanceMs = timestamp - snapshot.date.getTime();
      if (timeFrameCache?.base === snapshot && timeFrameCache.timestamp === timestamp) {
        return {
          snapshot: timeFrameCache.snapshot,
          camera: timeFrameCache.sourceCamera === camera ? timeFrameCache.camera
            : cameraAtOffset(camera, observer.latitude, advanceMs),
          horizon: timeFrameCache.horizon,
        };
      }
      const advanced = snapshotAtOffset(snapshot, camera, advanceMs);
      const horizon = zenithAtOffset(observer.latitude, advanceMs);
      timeFrameCache = { base: snapshot, timestamp, snapshot: advanced.snapshot, horizon,
        sourceCamera: camera, camera: advanced.camera };
      return {
        ...advanced,
        horizon,
      };
    };
    const drawStars = ({ snapshot: current, camera, horizon }: ReturnType<typeof snapshotAtOffset> & { horizon: readonly number[] }, panFrameStart?: number) => {
      const groundY = baseCameraRef.current ? horizonScreenY(baseCameraRef.current) : Infinity;
      const style = {
        isDark: isDarkRef.current,
        mobile: camera.width < MOBILE_BREAKPOINT_PX,
        presentation: 'look-up' as const,
        horizonY: groundY,
        trailBlend: starHeadBlendRef.current,
        trailPositionBlend: trailPositionBlendRef.current,
        magnitudeLimit: Math.min(starDetailLimitRef.current,
          pointerDown.current?.dragging ? pointerDown.current.magnitudeLimit : Infinity),
      };
      const rendered = projectSkyStars(current, camera, style);
      if (baseCameraRef.current && style.trailPositionBlend > 0) {
        refreshTrailAnchors(baseCameraRef.current, rendered);
        for (const entry of rendered) {
          entry.point = trailHeadPoint(entry.point, trailHeadPositionsRef.current.get(entry.star.id), style.trailPositionBlend);
        }
      }
      drawSky(ctx, current, camera, style, rendered);
      renderGuides(snapshot, camera, horizon, false, current.date.getTime());
      renderGround(current.twilight);
      renderRetainedTrails();
      const pan = pointerDown.current?.dragging ? pointerDown.current : null;
      if (pan && panFrameStart !== undefined && pan.magnitudeLimit === Infinity) {
        const elapsed = performance.now() - panFrameStart;
        if (elapsed > PAN_FRAME_BUDGET_MS) {
          pan.slowFrames.push(elapsed);
          if (pan.slowFrames.length === SLOW_PAN_FRAMES) {
            const limit = pan.slowFrames.every(ms => ms > SLOWER_PAN_FRAME_MS) ? 5.2 : 5.8;
            pan.magnitudeLimit = limit;
          }
        } else pan.slowFrames.length = 0;
      }
      return rendered.filter(entry => entry.point.y <= groundY);
    };
    const render = () => {
      const current = currentFrame();
      if (!current) return;
      const { camera, snapshot: displayed, horizon } = current;
      const started = performance.now();
      const rendered = drawStars(current, started);
      if (draggingRef.current) {
        const published = useSkyStore.getState().snapshotDate;
        if (published === null || Math.abs(displayed.date.getTime() - published) >= 1000) {
          setSnapshotDate(displayed.date.getTime());
        }
        if (new URLSearchParams(window.location.search).has('skydebug')) {
          (window as unknown as Record<string, unknown>).__sky = {
            observer: displayed.observer, lightPollution: displayed.pollution,
            snapshot: displayed, camera, rendered, interactiveStars: [], facing: facingRef.current,
            view: viewRef.current, dragging: true, localCamera: baseCameraRef.current,
            groundY: horizonScreenY(baseCameraRef.current!), campfire: projectCampfire(baseCameraRef.current!),
            computeDurationMs, renderDurationMs: performance.now() - started,
          };
        }
        return;
      }
      setSnapshotDate(displayed.date.getTime());
      const stars = interactiveStars(rendered, camera);
      starsRef.current = stars;
      reconcilePinned(stars.map(({ star }) => star.id));
      const previewStars = readConstellationPreview(new URLSearchParams(window.location.search).get('constellationPreview')) === null
        ? [] : constellationHitTargets(rendered, displayed.constellationStars, camera, horizon);
      previewStarsRef.current = previewStars;
      visibleStarsRef.current = rendered.filter(({ point }) => point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height);
      const groundY = horizonScreenY(baseCameraRef.current!);
      setFrame({ camera, snapshot: displayed, horizon, rendered, stars, groundY });

      if (new URLSearchParams(window.location.search).has('skydebug')) {
        (window as unknown as Record<string, unknown>).__sky = {
          observer: displayed.observer,
          lightPollution: displayed.pollution,
          snapshot: displayed, camera, rendered, interactiveStars: stars, facing: facingRef.current,
          view: viewRef.current, dragging: false, localCamera: baseCameraRef.current,
          groundY, campfire: projectCampfire(baseCameraRef.current!),
          computeDurationMs, renderDurationMs: performance.now() - started,
        };
      }
    };
    renderRef.current = render;
    redrawStarsRef.current = () => {
      const current = currentFrame();
      if (current) drawStars(current);
    };
    computeRef.current = () => { compute(); render(); };
    recomputeSnapshotRef.current = compute;
    reprojectRef.current = () => {
      const previous = baseCameraRef.current;
      if (!previous) return;
      baseCameraRef.current = createLookUpCamera(previous.width, previous.height, viewRef.current);
      cameraRef.current = baseCameraRef.current;
      render();
    };
    const resize = () => {
      const width = sky.clientWidth;
      const height = sky.clientHeight;
      if (!width || !height) return;
      setSkySize(current => current?.width === width && current.height === height ? current : { width, height });
      fitViewport(width, height);
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
      const guides = guidesCanvasRef.current;
      if (guides) {
        guides.width = canvas.width;
        guides.height = canvas.height;
        guides.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const ground = groundCanvasRef.current;
      if (ground) {
        ground.width = canvas.width;
        ground.height = canvas.height;
        ground.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      baseCameraRef.current = createLookUpCamera(width, height, viewRef.current);
      cameraRef.current = baseCameraRef.current;
      render();
    };
    const resizeObserver = new ResizeObserver(() => {
      const previous = baseCameraRef.current;
      const width = sky.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, width < MOBILE_BREAKPOINT_PX ? 1.5 : 2);
      if (previous?.width === width && previous.height === sky.clientHeight && canvas.width === Math.round(width * dpr)) return;
      finishPan();
      if (holdRef.current.active) endHold();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(resize);
    });

    compute();
    resize();
    resizeObserver.observe(sky);
    const timer = dateOverride === null ? window.setInterval(() => {
      if (holdRef.current.active || skyPreparationRef.current) return;
      compute();
      render();
    }, SKY_UPDATE_INTERVAL_MS) : null;
    const clockTimer = dateOverride === null ? window.setInterval(() => {
      if (!holdRef.current.active) render();
    }, 1000) : null;
    return () => {
      finishPan(false);
      stopHold();
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
      if (timer !== null) window.clearInterval(timer);
      if (clockTimer !== null) window.clearInterval(clockTimer);
      renderRef.current = () => {};
      redrawStarsRef.current = () => {};
      reprojectRef.current = () => {};
      computeRef.current = () => {};
      recomputeSnapshotRef.current = () => {};
      prepareSkyRef.current = () => () => {};
    };
  }, [observer, dateOverride, setSnapshotDate, reconcilePinned, clearTrails, endHold, stopHold, renderGuides, renderGround, renderRetainedTrails, refreshTrailAnchors, finishPan, fitViewport]);

  const captureLighting = useCallback(() => {
    const canvas = canvasRef.current;
    const trail = trailCanvasRef.current;
    const hasTrails = trailBufferRef.current.hasTrails();
    if (!canvas || !trail || (reducedRef.current && !hasTrails)) return;
    const outgoing = document.createElement('canvas');
    outgoing.width = canvas.width;
    outgoing.height = canvas.height;
    outgoing.className = 'absolute inset-0 h-full w-full pointer-events-none';
    outgoing.setAttribute('aria-hidden', 'true');
    const ctx = outgoing.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = groundColorRef.current;
    ctx.fillRect(0, 0, outgoing.width, outgoing.height);
    ctx.drawImage(canvas, 0, 0);
    if (hasTrails) {
      ctx.globalAlpha = Number(trail.style.opacity || 1);
      ctx.drawImage(trail, 0, 0);
    }
    const previous = lightingLayerRef.current?.canvas;
    if (previous) {
      ctx.globalAlpha = Number(getComputedStyle(previous).opacity);
      ctx.drawImage(previous, 0, 0);
      removeLightingLayer();
    }
    trail.after(outgoing);
    lightingLayerRef.current = { canvas: outgoing };
  }, [removeLightingLayer]);

  useLayoutEffect(() => {
    pollutionRef.current = pollution;
    const switching = previousLookMode.current !== skyLookMode;
    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.observer !== observer || trailContextRef.current.dateOverride !== dateOverride) {
      previousLookMode.current = skyLookMode;
      return;
    }
    if (snapshot.pollution === pollution && snapshot.cityLimitingMagnitude === cityLimit) {
      previousLookMode.current = skyLookMode;
      if (switching) renderRef.current();
      return;
    }
    previousLookMode.current = skyLookMode;
    const holding = holdRef.current.active;
    const hadTrails = holdRef.current.active || trailBufferRef.current.hasTrails();
    if (!switching && holding) return;
    if (switching) captureLighting();
    if (switching && hadTrails) {
      finishHoldForLightingChange();
      clearTrails(true);
    }
    const cancel = prepareSkyRef.current(pollution, cityLimit, () => {
      renderRef.current();
      if (switching) revealLighting();
    });
    return () => {
      cancel();
      if (switching) removeLightingLayer();
    };
  }, [observer, dateOverride, pollution, cityLimit, skyLookMode, captureLighting, clearTrails,
    finishHoldForLightingChange, removeLightingLayer, revealLighting]);

  useLayoutEffect(() => removeLightingLayer, [view, isDark, observer, dateOverride, removeLightingLayer]);

  useEffect(() => () => {
    window.clearTimeout(starDetailTimerRef.current);
    clearTrails();
    useSkyStore.getState().setTimeOffset(0);
  }, [clearTrails]);

  useEffect(() => {
    const blur = () => { finishPan(); };
    const hidden = () => { if (document.hidden) finishPan(); };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [finishPan]);

  useLayoutEffect(() => {
    const locationChanged = previousObserverRef.current !== observer;
    const facingChanged = facingRef.current !== facing;
    const viewChanged = viewRef.current.azimuth !== view.azimuth || viewRef.current.altitude !== view.altitude;
    if (!facingChanged && !locationChanged && !viewChanged) return;
    if (facingChanged || locationChanged) finishPan(false);
    if (locationChanged) stopHold();
    else if (!draggingRef.current) endHold();
    previousObserverRef.current = observer;
    facingRef.current = facing;
    viewRef.current = view;
    if (!facingChanged && !locationChanged) {
      reprojectRef.current();
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (facingChanged && baseCameraRef.current && baseCameraRef.current.width < MOBILE_BREAKPOINT_PX &&
      !reduced && !trailBufferRef.current.hasTrails() &&
      (snapshotRef.current?.celestialStars.length ?? 0) > 4_105) {
      starDetailLimitRef.current = 5.8;
      restoreStarDetail();
    }
    setHoveredId(null);
    setHoveredPreviewId(null);
    pointerStarRef.current = null;
    suppressedStarRef.current = null;
    pointerDown.current = null;
    clearPinned();
    if (!locationChanged && trailBufferRef.current.hasTrails()) {
      reprojectRef.current();
      return;
    }
    const layer = directionLayerRef.current;
    const previous = previousLayerRef.current;
    const canvas = canvasRef.current;
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
  }, [facing, view, observer, clearPinned, endHold, stopHold, finishPan, restoreStarDetail]);

  useEffect(() => {
    isDarkRef.current = isDark;
    groundColorRef.current = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    renderRef.current();
  }, [isDark]);

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

  // Leaving Look Up hands the sky over to the page background: a viewport-sized
  // layer renders the background's current-time view beneath the
  // captured star bitmap, then both rise together while the real background
  // slides in from below. At landing the layer is pixel-identical to the
  // background, so the handover is invisible.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      const rect = skyRectRef.current;
      if (!canvas || !rect) return;
      if (window.location.pathname.replace(/\/$/, '') === '/stars-above') return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const state = useSkyStore.getState();
      const snapshot = computeSky(new Date(state.dateOverride ?? Date.now()), state.observer, state.pollution);

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
    if (!frame) return;
    const named = new Set(frame.stars.map(({ star }) => star.id));
    const previews = new Set(previewStarsRef.current.map(({ star }) => star.id));
    setHoveredId(id => id !== null && named.has(id) ? id : null);
    setHoveredPreviewId(id => id !== null && previews.has(id) ? id : null);
    if (pointerStarRef.current !== null && !named.has(pointerStarRef.current) && !previews.has(pointerStarRef.current)) {
      pointerStarRef.current = null;
    }
    if (suppressedStarRef.current !== null && !named.has(suppressedStarRef.current) && !previews.has(suppressedStarRef.current)) {
      suppressedStarRef.current = null;
    }
  }, [frame]);

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
    const camera = baseCameraRef.current;
    if (camera && event.clientY - bounds.top > horizonScreenY(camera)) return null;
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
      data-trails-active={trailsActive ? '' : undefined}
      data-view-dragging={dragging ? '' : undefined}
      role="region"
      tabIndex={-1}
      aria-label={`${directionName(view.azimuth)}-facing starry sky`}
      style={{ cursor: dragging ? 'grabbing' : hoveredId !== null ? 'pointer' : 'grab' }}
      onPointerMove={(event) => {
        const pointer = pointerDown.current;
        if (pointer && pointer.id === event.pointerId) {
          const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
          if (!pointer.dragging && Math.hypot(dx, dy) > 10) {
            pointer.dragging = true;
            draggingRef.current = true;
            removeLightingLayer();
            endHold();
            setDragging(true);
            setHoveredId(null);
            setHoveredPreviewId(null);
            pointerStarRef.current = null;
            suppressedStarRef.current = null;
            setFrame(null);
          }
          if (pointer.dragging) {
            pointer.latestView = dragSkyView(pointer.view, dx, dy, pointer.camera);
            if (!panRafRef.current) {
              panRafRef.current = requestAnimationFrame(() => {
                panRafRef.current = 0;
                const current = pointerDown.current;
                if (current?.dragging) setView(current.latestView);
              });
            }
          }
          return;
        }
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
        if (pointerDown.current) return;
        setHoveredId(null);
        setHoveredPreviewId(null);
        pointerStarRef.current = null;
        suppressedStarRef.current = null;
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary || pointerDown.current || !baseCameraRef.current) return;
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerDown.current = {
          id: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current,
          camera: baseCameraRef.current, dragging: false, latestView: viewRef.current,
          slowFrames: [], magnitudeLimit: Infinity,
        };
      }}
      onPointerUp={(event) => {
        const start = pointerDown.current;
        if (!start || start.id !== event.pointerId || event.button !== 0 || !event.isPrimary) return;
        if (start.dragging) start.latestView = dragSkyView(start.view, event.clientX - start.x, event.clientY - start.y, start.camera);
        if (finishPan() || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
        const star = hitNamed(event)?.star;
        if (star) toggleNamedStar(star.id);
      }}
      onPointerCancel={() => { finishPan(); }}
      onLostPointerCapture={() => { if (pointerDown.current) finishPan(); }}
    >
      <SkyHintsProvider ready={skySize !== null} holding={timeTravel.holding} dragging={dragging}
        polarisVisible={observer.source === 'default' && !!frame && frame.snapshot.sunAltitude <= -12 &&
          frame.stars.some(({ star }) => star.hip === 11767)}>
      <div className="look-up-ground-objects pointer-events-none absolute inset-0 z-20">
        <Campfire camera={localCamera} dragging={dragging} skyRef={skyRef} />
      </div>
      <CampfireLog skyHeight={frame?.camera.height} />
      <button
        type="button"
        className="sky-tool-button sky-guides-toggle"
        aria-label={guidesOpen ? 'Hide sky grid' : 'Show sky grid'}
        aria-pressed={guidesOpen}
        onPointerDown={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()}
        onPointerMove={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          guidesOpenRef.current = !guidesOpenRef.current;
          setGuidesOpen(guidesOpenRef.current);
          const current = guideFrameRef.current;
          if (current && guidesOpenRef.current) renderGuides(current.snapshot, current.camera, current.horizon, true, current.timestamp);
        }}
      >
        {guidesOpen ? <Check size={15} strokeWidth={1.6} aria-hidden="true" />
          : <Grid2X2 size={15} strokeWidth={1.6} aria-hidden="true" />}
        Grid
      </button>
      {!dragging && pinnedIds.length > 0 && (
        <button
          type="button"
          className="sky-clear-names absolute z-30 text-xs text-neutral-500 hover:text-accent transition-colors duration-200 rounded focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
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
        preview={dateOverride !== null}
        onHoldStart={startHold}
        onHoldEnd={endHold}
        onReturnNow={returnNow}
        onBackToLive={backToLive}
      />
      <SkyViewControls dragging={dragging} />
      <div ref={sceneRef} className="look-up-scene absolute inset-0">
      <MeteorBackground maxYFraction={0.9} paused={trailsActive || timeTravel.holding} skyCameraRef={baseCameraRef} />
      <div ref={directionLayerRef} className="look-up-direction absolute inset-0">
      {frame && <Suspense fallback={null}>
        <ConstellationPreview
          key={`${facing}:${frame.camera.width}:${frame.camera.height}:${frame.snapshot.observer.latitude}:${frame.snapshot.observer.longitude}:${frame.snapshot.pollution.limitingMagnitude}`}
          starId={hoveredPreviewId} selectedStarIds={pinnedIds} pinnedConstellations={pinnedConstellations}
          rendered={frame.rendered} constellationStars={frame.snapshot.constellationStars}
          camera={frame.camera} horizon={frame.horizon} labelHeight={Math.min(frame.camera.height, frame.groundY)} skyRef={skyRef} sceneRef={sceneRef} />
      </Suspense>}
      <canvas ref={canvasRef} aria-hidden="true" className="look-up-stars absolute inset-0 h-full w-full" />
      <canvas ref={trailCanvasRef} aria-hidden="true" className="look-up-trails absolute inset-0 h-full w-full" />
      <SkyGuides ref={guidesCanvasRef} visible={guidesOpen} />
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
        camera={{ ...frame.camera, height: Math.min(frame.camera.height, frame.groundY) }} skyRef={skyRef} sceneRef={sceneRef} />}
      </div>
      <div ref={previousLayerRef} aria-hidden="true" className="look-up-previous absolute inset-0 pointer-events-none" />
      <canvas ref={groundCanvasRef} aria-hidden="true" className="look-up-ground pointer-events-none absolute inset-0 z-40 h-full w-full" />
      </div>
      </SkyHintsProvider>
    </div>
  );
}
