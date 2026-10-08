'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import './campfire.css';

const EMBER_PATHS = [
  { left: '47%', drift: '-9px', rise: '-46px' },
  { left: '54%', drift: '12px', rise: '-38px' },
  { left: '50%', drift: '-3px', rise: '-53px' },
] as const;

interface Ember {
  id: number;
  path: number;
}

export default function Campfire() {
  const [fireOn, setFireOn] = useState(false);
  const [embers, setEmbers] = useState<Ember[]>([]);
  const emberId = useRef(0);
  const reducedMotion = useReducedMotion();
  const id = useId();

  useEffect(() => {
    if (reducedMotion) {
      setEmbers([]);
      return;
    }
    if (!fireOn) return;
    const timer = window.setInterval(() => {
      const next = emberId.current++;
      setEmbers((current) => [...current.slice(-2), { id: next, path: next % EMBER_PATHS.length }]);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [fireOn, reducedMotion]);

  return (
    <>
      <div className="campfire-decoration" data-fire-on={fireOn} aria-hidden="true">
        <div className="campfire-glow"><div className="campfire-glow-breathe" /></div>
        <div className="campfire-body">
          <svg viewBox="0 0 128 104" className="campfire-art" focusable="false">
            <defs>
              <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stopColor="#39343a" />
                <stop offset="1" stopColor="#1c2130" />
              </linearGradient>
              <linearGradient id={`${id}-flame`} x1="0" y1="1" x2="0.1" y2="0">
                <stop offset="0" stopColor="#e5c396" stopOpacity="0.88" />
                <stop offset="0.35" stopColor="#cf9a6b" stopOpacity="0.8" />
                <stop offset="0.75" stopColor="#ad7753" stopOpacity="0.48" />
                <stop offset="1" stopColor="#b98e6b" stopOpacity="0.08" />
              </linearGradient>
              <linearGradient id={`${id}-core`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#eed7ad" stopOpacity="0.83" />
                <stop offset="1" stopColor="#d0a67c" stopOpacity="0.16" />
              </linearGradient>
              <filter id={`${id}-soft`} x="-25%" y="-15%" width="150%" height="130%">
                <feGaussianBlur stdDeviation="0.55" />
              </filter>
            </defs>
            <g fill={`url(#${id}-wood)`} stroke="#4a4142" strokeWidth="0.7">
              <path d="M24 96 27 88Q29 86 34 88L99 94 103 100Q67 104 24 96Z" />
              <path d="M30 98 32 93 91 82Q96 81 100 85L102 90Q64 102 30 98Z" />
              <path d="M39 85Q38 82 42 81L86 98 81 102Q58 95 39 85Z" />
            </g>
            <g stroke="#66534b" strokeWidth="0.65" opacity="0.46" fill="none">
              <path d="m35 93 35 5m-26-4 31 3m-35-1 49-10m-36 0 18 10" />
              <ellipse cx="99" cy="87" rx="2" ry="2.6" transform="rotate(-20 99 87)" />
            </g>
            <g fill="#a9764f" opacity="0.18">
              <circle cx="62" cy="93" r="0.9" /><circle cx="70" cy="94" r="0.7" />
            </g>
            <g className="campfire-log-light" fill="none" stroke="#ba8d62" strokeWidth="0.9">
              <path d="m40 91 34 6m-18-2 28-6m-31-2 13 6" />
            </g>
            <g className="campfire-flames" filter={`url(#${id}-soft)`}>
              <g className="campfire-flame-breathe">
                <path fill={`url(#${id}-flame)`} d="M63 93C43 88 46 72 53 59C60 47 57 32 64 18C60 37 75 42 78 57C81 73 89 84 73 92Z" />
                <path className="campfire-flame-tip" fill={`url(#${id}-flame)`} d="M69 93C88 87 79 73 75 62C72 53 74 47 72 43C71 61 57 75 61 89Z" />
                <path fill={`url(#${id}-core)`} d="M61 94C53 87 61 78 65 67C69 80 77 86 71 93Z" />
              </g>
            </g>
          </svg>
          {embers.map((ember) => {
            const path = EMBER_PATHS[ember.path];
            return (
              <span
                key={ember.id}
                className="campfire-ember"
                style={{ left: path.left, '--ember-drift': path.drift, '--ember-rise': path.rise } as CSSProperties}
                onAnimationEnd={() => setEmbers((current) => current.filter(({ id }) => id !== ember.id))}
              />
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="campfire-toggle"
        aria-label={fireOn ? 'Extinguish campfire' : 'Light campfire'}
        aria-pressed={fireOn}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerLeave={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setFireOn((on) => !on);
        }}
      />
    </>
  );
}
