'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { positionStarLabel, positionStarLabels, type InteractiveStar, type StarLabelPosition } from '@/lib/sky/look-up';
import type { Camera } from '@/lib/sky/projection';
import type { LabelRect } from '@/lib/sky/constellation-label';

const OBSTACLES = '.campfire-art, .campfire-hint, .campfire-count, .campfire-notifications, .look-up-star-hint, button:not(.look-up-star-focus), a, input, select, textarea, [role="dialog"]';

export default function StarLabels({ stars, camera, skyRef, sceneRef, onDisplay }: {
  stars: readonly InteractiveStar[];
  camera: Camera;
  skyRef: RefObject<HTMLDivElement | null>;
  sceneRef: RefObject<HTMLDivElement | null>;
  onDisplay: () => void;
}) {
  const labels = useRef(new Map<number, HTMLDivElement>());
  const previous = useRef(new Map<number, StarLabelPosition>());
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const sky = skyRef.current, scene = sceneRef.current;
    if (!sky || !scene || !stars.length) return;
    const observed = new Set<Element>();
    const resize = new ResizeObserver(measure);
    function measure() {
      const origin = scene!.getBoundingClientRect();
      const controls = [...sky!.querySelectorAll<HTMLElement>(OBSTACLES)];
      const elements = [...controls, ...labels.current.values()];
      for (const element of observed) if (!elements.includes(element as HTMLElement)) {
        resize.unobserve(element); observed.delete(element);
      }
      for (const element of elements) if (!observed.has(element)) {
        resize.observe(element); observed.add(element);
      }
      const obstacles: LabelRect[] = [];
      const active = new Set(stars.map(entry => entry.star.id));
      for (const element of [...controls, ...[...labels.current].filter(([id]) => !active.has(id)).map(([, label]) => label)]) {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        obstacles.push({ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height });
      }
      const measured = stars.flatMap(({ star, point }) => {
        const label = labels.current.get(star.id);
        if (!label) return [];
        const size = label.getBoundingClientRect();
        return [{ id: star.id, x: point.x, y: point.y, width: size.width, height: size.height }];
      });
      const positions = positionStarLabels(measured, camera.width, camera.height, obstacles, previous.current);
      previous.current = positions;
      for (const entry of measured) {
        const label = labels.current.get(entry.id)!;
        const position = positions.get(entry.id);
        label.style.visibility = position ? 'visible' : 'hidden';
        if (!position) continue;
        label.style.left = `${position.left}px`; label.style.top = `${position.top}px`;
        const preferred = positionStarLabel(entry.x, entry.y, camera.width, camera.height, entry.width, entry.height);
        const leader = label.querySelector('line')!;
        const displaced = Math.hypot(position.left - preferred.left, position.top - preferred.top) > 1;
        leader.style.visibility = displaced ? 'visible' : 'hidden';
        const endX = Math.max(position.left, Math.min(entry.x, position.left + entry.width));
        const endY = Math.max(position.top, Math.min(entry.y, position.top + entry.height));
        const length = Math.hypot(endX - entry.x, endY - entry.y);
        if (length > 0) {
          const dx = (endX - entry.x) / length, dy = (endY - entry.y) / length;
          leader.setAttribute('x1', `${entry.x + dx * 3 - position.left}`);
          leader.setAttribute('y1', `${entry.y + dy * 3 - position.top}`);
          leader.setAttribute('x2', `${endX - dx * 4 - position.left}`);
          leader.setAttribute('y2', `${endY - dy * 4 - position.top}`);
        }
      }
      sky!.dispatchEvent(new Event('sky-label-layout'));
    }
    const mutations = new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (!target || target.closest('.look-up-label, .constellation-label, .constellation-preview, .marshmallow-meteor')) return false;
        if (record.type === 'childList') return [...record.addedNodes, ...record.removedNodes]
          .some(node => node instanceof Element && (node.matches(`.look-up-label, ${OBSTACLES}`) || node.querySelector(OBSTACLES)));
        return Boolean(target.closest(OBSTACLES));
      })) measure();
    });
    mutations.observe(sky, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'aria-expanded', 'data-fire-on'] });
    measure();
    return () => { resize.disconnect(); mutations.disconnect(); };
  }, [stars, camera, skyRef, sceneRef]);

  return <AnimatePresence>
    {stars.map(({ star, name }) => <motion.div
      key={star.id}
      ref={label => { if (label) labels.current.set(star.id, label); else labels.current.delete(star.id); }}
      role="status" data-star-id={star.id}
      className="look-up-label absolute pointer-events-none select-none text-neutral-500"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
      onAnimationComplete={definition => {
        if (typeof definition === 'object' && 'opacity' in definition && definition.opacity === 1) onDisplay();
      }}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line stroke="currentColor" strokeWidth="0.75" opacity="0.4" style={{ visibility: 'hidden' }} />
      </svg>
      <div lang="zh-CN" className="text-sm leading-6">{name.chinese}</div>
      <div className="text-xs leading-5">{name.english}</div>
    </motion.div>)}
  </AnimatePresence>;
}
