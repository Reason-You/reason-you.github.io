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
        <div className="campfire-hint" />
        <div className="campfire-body">
          <svg viewBox="0 0 140 110" className="campfire-art" focusable="false">
            <defs>
              <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stopColor="#453d44" />
                <stop offset="1" stopColor="#221f2e" />
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
            <g fill={`url(#${id}-wood)`} stroke="#4a4142" strokeWidth="0.75">
              <path d="M28 102 31 95Q33 93 40 94L104 97Q112 98 111 104Q66 108 28 102Z" />
              <path d="M36 97 38 91Q43 88 50 89L102 84Q109 84 110 88L111 93Q70 101 36 97Z" />
              <path d="M50 91Q47 87 51 85L92 100 88 105Q68 99 50 91Z" />
            </g>
            <g stroke="#66534b" strokeWidth="0.6" opacity="0.55" fill="none">
              <path d="m38 96 44 3m-30-2 38 2m-32-1 42-9m-30-1 14 9" />
              <ellipse cx="108" cy="100.5" rx="3.4" ry="4.1" transform="rotate(-14 108 100.5)" />
              <ellipse cx="109" cy="90" rx="3" ry="3.6" transform="rotate(-10 109 90)" />
              <ellipse cx="89" cy="102" rx="2.6" ry="3.1" transform="rotate(58 89 102)" />
            </g>
            <g fill="#6e5a4c" opacity="0.5">
              <ellipse cx="108" cy="100.5" rx="2.2" ry="2.8" transform="rotate(-14 108 100.5)" />
              <ellipse cx="109" cy="90" rx="1.9" ry="2.4" transform="rotate(-10 109 90)" />
            </g>
            <g fill="#a9764f" opacity="0.18">
              <circle cx="62" cy="98" r="0.9" /><circle cx="71" cy="99" r="0.7" /><circle cx="54" cy="97" r="0.6" />
            </g>
            <g className="campfire-log-light" fill="none" stroke="#ba8d62" strokeWidth="0.9">
              <path d="m42 96 40 2m-24 0 34-3m-40 5 24 2m6-9 30-4" />
            </g>
            <g className="campfire-flames" filter={`url(#${id}-soft)`}>
              <g className="campfire-flame-breathe">
                <path fill={`url(#${id}-flame)`} d="M57 97C45 94 42 84 47 74C51 66 49 60 54 55C52 65 60 69 62 77C65 86 65 93 61 98Z" />
                <path fill={`url(#${id}-flame)`} d="M84 96C95 92 94 82 90 73C87 66 88 61 85 56C86 66 78 69 76 76C73 85 74 92 78 97Z" />
                <path className="campfire-flame-tip" fill={`url(#${id}-flame)`} d="M70 98C46 96 40 79 50 63C58 50 56 41 63 31C61 46 74 51 78 62C85 75 93 86 86 96Z" />
                <path fill={`url(#${id}-core)`} d="M70 97C61 95 58 85 64 75C68 67 66 59 70 52C69 62 77 66 78 74C80 85 78 93 74 97Z" />
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
