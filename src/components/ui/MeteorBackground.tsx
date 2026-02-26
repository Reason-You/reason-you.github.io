'use client';

import { useEffect, useRef } from 'react';
import { useThemeStore, resolveTheme } from '@/lib/stores/themeStore';

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  width: number;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createMeteor(width: number, height: number): Meteor {
  const angle = randomBetween(0.3, 0.55);
  const speed = randomBetween(38, 68);
  const startX = randomBetween(-width * 0.15, width * 0.95);
  const startY = randomBetween(-height * 0.25, height * 0.2);

  return {
    x: startX,
    y: startY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    length: randomBetween(90, 160),
    width: randomBetween(1.1, 2.1),
  };
}

export default function MeteorBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const effectiveTheme = resolveTheme(theme);
  const themeRef = useRef<'light' | 'dark'>(effectiveTheme);

  useEffect(() => {
    themeRef.current = effectiveTheme;
  }, [effectiveTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
      meteors[index] = createMeteor(width, height);
    };

    resize();
    for (let i = 0; i < meteorCount; i += 1) {
      meteors.push(createMeteor(width, height));
    }

    const draw = (ts: number) => {
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 1 / 60;
      lastTs = ts;

      const isDark = themeRef.current === 'dark';
      const meteorColor = isDark ? [222, 240, 255] : [154, 174, 196];
      const layerOpacity = isDark ? 0.26 : 0.14;

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

        const gradient = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
        gradient.addColorStop(0, `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, 0)`);
        gradient.addColorStop(0.75, `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, 0.36)`);
        gradient.addColorStop(1, `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, 0.86)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = meteor.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(meteor.x, meteor.y);
        ctx.stroke();

        ctx.fillStyle = `rgba(${meteorColor[0]}, ${meteorColor[1]}, ${meteorColor[2]}, 0.75)`;
        ctx.beginPath();
        ctx.arc(meteor.x, meteor.y, meteor.width * 0.9, 0, Math.PI * 2);
        ctx.fill();

        if (meteor.x - meteor.length > width || meteor.y - meteor.length > height) {
          resetMeteor(i);
        }
      }

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
