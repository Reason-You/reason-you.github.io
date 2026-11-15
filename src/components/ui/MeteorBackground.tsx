'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useThemeStore, resolveTheme } from '@/lib/stores/themeStore';
import { BACKGROUND_METEOR } from '@/lib/sky/meteor-appearance';
import { projectSkyDirection, projectSkyDirectionSegment, unprojectSkyPoint, type Camera } from '@/lib/sky/projection';

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  width: number;
  birthCamera: Camera | null;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createMeteor(width: number, height: number, birthCamera: Camera | null = null): Meteor {
  const angle = randomBetween(0.3, 0.55);
  const speed = randomBetween(38, 68);
  const startX = randomBetween(-width * 0.15, width * 0.95);
  // Keep meteors inside the top sky window (roughly 0-45vh).
  const startY = randomBetween(-height * 0.22, height * 0.12);

  return {
    x: startX,
    y: startY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    length: randomBetween(90, 160),
    width: randomBetween(1.1, 2.1),
    birthCamera,
  };
}

export default function MeteorBackground({ maxYFraction = 0.55, paused = false, skyCameraRef }: {
  maxYFraction?: number;
  paused?: boolean;
  skyCameraRef?: RefObject<Camera | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  const resumeRef = useRef<(() => void) | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const effectiveTheme = resolveTheme(theme);
  const themeRef = useRef<'light' | 'dark'>(effectiveTheme);

  useEffect(() => {
    themeRef.current = effectiveTheme;
  }, [effectiveTheme]);

  useEffect(() => {
    pausedRef.current = paused;
    resumeRef.current?.();
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    let rafId = 0;
    let lastTs = 0;
    let width = 0;
    let height = 0;
    const meteorCount = Math.floor(randomBetween(3, 6));
    const meteors: Meteor[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resetMeteor = (index: number) => {
      const camera = skyCameraRef?.current ?? null;
      if (skyCameraRef && !camera) return;
      meteors[index] = createMeteor(camera?.width ?? width, camera?.height ?? height, camera);
    };

    resize();
    for (let i = 0; i < meteorCount; i += 1) resetMeteor(i);

    const draw = (ts: number) => {
      if (pausedRef.current || motionQuery?.matches) { rafId = 0; return; }
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 1 / 60;
      lastTs = ts;
      const camera = skyCameraRef?.current ?? null;
      if (skyCameraRef && !camera) {
        rafId = window.requestAnimationFrame(draw);
        return;
      }
      for (let i = meteors.length; i < meteorCount; i += 1) resetMeteor(i);

      const isDark = themeRef.current === 'dark';
      const { color: meteorColor, opacity: layerOpacity } = isDark ? BACKGROUND_METEOR.dark : BACKGROUND_METEOR.light;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = layerOpacity;

      for (let i = 0; i < meteors.length; i += 1) {
        const meteor = meteors[i];
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;

        const speed = Math.hypot(meteor.vx, meteor.vy) || 1;
        const tailX = meteor.x - (meteor.vx / speed) * meteor.length;
        const tailY = meteor.y - (meteor.vy / speed) * meteor.length;
        let from = { x: tailX, y: tailY }, to = { x: meteor.x, y: meteor.y };
        let gradientFrom = from, gradientTo = to;
        let head: { x: number; y: number } | null = to;
        let visible = true;
        if (meteor.birthCamera && camera) {
          const tailDirection = unprojectSkyPoint(from, meteor.birthCamera);
          const headDirection = unprojectSkyPoint(to, meteor.birthCamera);
          const segment = projectSkyDirectionSegment(tailDirection, headDirection, camera);
          visible = segment !== null;
          if (segment) {
            const projectedTail = projectSkyDirection(tailDirection, camera);
            const projectedHead = projectSkyDirection(headDirection, camera);
            from = segment.from;
            to = segment.to;
            gradientFrom = projectedTail ?? from;
            gradientTo = projectedHead ?? to;
            head = headDirection[2] >= 0 ? projectedHead : null;
          }
        }

        if (visible) {
          const gradient = ctx.createLinearGradient(gradientFrom.x, gradientFrom.y, gradientTo.x, gradientTo.y);
          gradient.addColorStop(0, `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, 0)`);
          gradient.addColorStop(0.75, `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, ${BACKGROUND_METEOR.midAlpha})`);
          gradient.addColorStop(1, `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, ${BACKGROUND_METEOR.tipAlpha})`);

          ctx.strokeStyle = gradient;
          ctx.lineWidth = meteor.width;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();

          if (head) {
            ctx.fillStyle = `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, ${BACKGROUND_METEOR.headAlpha})`;
            ctx.beginPath();
            ctx.arc(head.x, head.y, meteor.width * 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Meteors belong to the page's flight window: recycle them once they
        // leave it instead of letting them cross the article.
        const planeWidth = meteor.birthCamera?.width ?? width;
        const planeHeight = meteor.birthCamera?.height ?? height;
        if (meteor.x - meteor.length > planeWidth || meteor.y > planeHeight * maxYFraction) {
          resetMeteor(i);
        }
      }

      rafId = window.requestAnimationFrame(draw);
    };

    const resume = () => {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      lastTs = 0;
      if (!pausedRef.current && !motionQuery?.matches) rafId = window.requestAnimationFrame(draw);
    };
    resumeRef.current = resume;
    resume();
    motionQuery?.addEventListener('change', resume);
    window.addEventListener('resize', resize);

    return () => {
      window.cancelAnimationFrame(rafId);
      resumeRef.current = null;
      motionQuery?.removeEventListener('change', resume);
      window.removeEventListener('resize', resize);
    };
  }, [maxYFraction, skyCameraRef]);

  return (
    <canvas
      ref={canvasRef}
      data-meteor-background
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 h-screen w-full max-w-full z-0"
    />
  );
}
