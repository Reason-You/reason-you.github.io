'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CONSTELLATION_NAMES } from '@/lib/sky/constellation-names';
import { placeConstellationLabel, type LabelPoint, type LabelRect } from '@/lib/sky/constellation-label';
import type { ConstellationSegment, CONSTELLATIONS } from '@/lib/sky/constellations';
import type { RenderedStar } from '@/lib/sky/renderer';
import type { Camera } from '@/lib/sky/projection';
import './constellation-label.css';

const OBSTACLES = '.look-up-label, .campfire-art, .campfire-hint, .campfire-count, .campfire-notifications, .look-up-star-hint, button:not(.look-up-star-focus), a, input, select, textarea, [role="dialog"]';

export default function ConstellationLabel({ constellation, segments, anchor, rendered, camera, skyRef, sceneRef }: {
  constellation: typeof CONSTELLATIONS[number];
  segments: readonly ConstellationSegment[];
  anchor: LabelPoint | null;
  rendered: readonly RenderedStar[];
  camera: Camera;
  skyRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<HTMLDivElement | null>;
}) {
  const labelRef = useRef<HTMLDivElement>(null);
  const previous = useRef<LabelPoint | null>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const label = labelRef.current, sky = skyRef.current, scene = sceneRef.current;
    if (!label || !sky || !scene) return;
    let stopped = false, queued = false;
    const resize = new ResizeObserver(() => invalidate());
    const observed = new Set<Element>();
    const measure = () => {
      if (stopped) return;
      queued = false;
      const origin = scene.getBoundingClientRect(), bounds = sky.getBoundingClientRect();
      const elements = [...sky.querySelectorAll<HTMLElement>(OBSTACLES)];
      for (const element of observed) if (!elements.includes(element as HTMLElement) && element !== label) {
        resize.unobserve(element); observed.delete(element);
      }
      const obstacles: LabelRect[] = [];
      for (const element of elements) {
        if (!observed.has(element)) { resize.observe(element); observed.add(element); }
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' ||
            (element.matches('.look-up-star-hint') && Number(style.opacity) === 0)) continue;
        obstacles.push({ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height });
      }
      for (const { star, point } of rendered) {
        if (star.mag > 1.5 || point.x < 0 || point.x > camera.width || point.y < 0 || point.y > camera.height) continue;
        obstacles.push({ x: point.x - 12, y: point.y - 12, width: 24, height: 24 });
      }
      const size = label.getBoundingClientRect();
      const x = Math.max(0, bounds.left - origin.left), y = Math.max(0, bounds.top - origin.top);
      const viewport = { x, y, width: Math.min(camera.width, bounds.right - origin.left) - x,
        height: Math.min(camera.height, bounds.bottom - origin.top) - y };
      const position = placeConstellationLabel({ segments, size: { width: size.width, height: size.height }, viewport, obstacles, previous: previous.current, anchor });
      previous.current = position;
      if (position) {
        label.style.left = `${position.x}px`; label.style.top = `${position.y}px`;
        label.style.visibility = 'visible';
      } else label.style.visibility = 'hidden';
    };
    function invalidate() {
      if (stopped || queued) return;
      // Visibility is removed before the browser can paint a newly overlapping star name.
      label!.style.visibility = 'hidden';
      queued = true;
      queueMicrotask(measure);
    }
    const mutations = new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (!target || target.closest('.constellation-label, .constellation-preview, .marshmallow-meteor')) return false;
        const concernsObstacle = (element: Element) => element.matches(OBSTACLES) || Boolean(element.querySelector(OBSTACLES));
        if (record.type === 'childList') {
          return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && concernsObstacle(node));
        }
        if (!target.closest(OBSTACLES) && !concernsObstacle(target)) return false;
        if (record.type === 'attributes' && record.attributeName === 'style') {
          const removeOpacity = (value: string | null) => (value ?? '').replace(/opacity:\s*[^;]+;?/g, '').trim();
          if (removeOpacity(record.oldValue) === removeOpacity(target.getAttribute('style'))) return false;
        }
        return true;
      });
      if (relevant) invalidate();
    });
    mutations.observe(sky, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeOldValue: true, attributeFilter: ['style', 'class', 'aria-expanded', 'data-fire-on'] });
    resize.observe(label); observed.add(label);
    sky.addEventListener('sky-label-layout', invalidate);
    sky.addEventListener('animationend', invalidate);
    sky.addEventListener('transitionend', invalidate);
    window.addEventListener('resize', invalidate);
    window.addEventListener('scroll', invalidate, true);
    document.fonts.addEventListener('loadingdone', invalidate);
    measure();
    return () => {
      stopped = true; mutations.disconnect(); resize.disconnect();
      sky.removeEventListener('sky-label-layout', invalidate);
      sky.removeEventListener('animationend', invalidate);
      sky.removeEventListener('transitionend', invalidate);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate, true);
      document.fonts.removeEventListener('loadingdone', invalidate);
    };
  }, [segments, anchor, rendered, camera, skyRef, sceneRef]);
  return (
    <motion.div ref={labelRef} className="constellation-label" data-constellation={constellation.id}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18 }} role="status">
      <div lang="zh-CN" className="constellation-label-chinese">{CONSTELLATION_NAMES[constellation.id].chinese}</div>
      <div lang="en" className="constellation-label-english">{constellation.name}</div>
    </motion.div>
  );
}
