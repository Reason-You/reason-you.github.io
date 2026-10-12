'use client';

import { useEffect, useId, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { resolveTheme, useThemeStore } from '@/lib/stores/themeStore';
import { meteorPhotometry, BACKGROUND_METEOR } from '@/lib/sky/meteor-appearance';
import { meteorFrame, type MarshmallowMeteorFlight } from '@/lib/sky/marshmallow-meteor';

export default function MarshmallowMeteor({ flight, onFinish }: {
  flight: MarshmallowMeteorFlight; onFinish: (id: number) => void;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  const theme = useThemeStore(state => state.theme);
  const dark = resolveTheme(theme) === 'dark';
  const rare = flight.kind === 'fireball';
  const light = meteorPhotometry(flight.brightnessGain, rare, dark);
  const group = useRef<SVGGElement>(null), head = useRef<SVGGElement>(null);
  const gradient = useRef<SVGLinearGradientElement>(null), paths = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    let raf = 0, start: number | null = null;
    const draw = (ts: number) => {
      start ??= ts;
      const elapsed = ts - start, frame = meteorFrame(flight, elapsed, !!reduced);
      group.current?.setAttribute('opacity', String(frame.opacity));
      head.current?.setAttribute('transform', `translate(${frame.head.x} ${frame.head.y})`);
      paths.current.forEach(path => path?.setAttribute('d', frame.path));
      gradient.current?.setAttribute('x1', String(frame.tail.x));
      gradient.current?.setAttribute('y1', String(frame.tail.y));
      gradient.current?.setAttribute('x2', String(frame.head.x));
      gradient.current?.setAttribute('y2', String(frame.head.y));
      if (elapsed >= flight.durationMs) onFinish(flight.id);
      else raf = requestAnimationFrame(draw);
    };
    const hidden = () => { if (document.hidden) { cancelAnimationFrame(raf); onFinish(flight.id); } };
    raf = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', hidden);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', hidden); };
  }, [flight, reduced, onFinish]);

  const color = dark ? (rare ? '#fff1d2' : '#e7efff') : '#526b87';
  const plume = dark ? '#efbb7e' : '#927d62';
  const initial = meteorFrame(flight, 0, !!reduced);
  return (
    <svg className="marshmallow-meteor" viewBox={`0 0 ${flight.width} ${flight.height}`} preserveAspectRatio="none" aria-hidden="true"
      data-kind={flight.kind} data-origin-x={flight.origin.x} data-origin-y={flight.origin.y}
      data-brightness-gain={flight.brightnessGain} data-duration-ms={flight.durationMs} data-reduced={!!reduced}>
      <defs>
        <linearGradient ref={gradient} id={`${id}-trail`} gradientUnits="userSpaceOnUse"
          x1={initial.tail.x} y1={initial.tail.y} x2={initial.head.x} y2={initial.head.y}>
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="0.75" stopColor={color} stopOpacity={BACKGROUND_METEOR.midAlpha / BACKGROUND_METEOR.tipAlpha} />
          <stop offset="1" stopColor={color} />
        </linearGradient>
        <filter id={`${id}-soft`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation={rare ? 3 : 1.5} /></filter>
      </defs>
      <g ref={group}>
        {[{ width: light.haloWidth, alpha: light.haloAlpha }, { width: light.plumeWidth, alpha: light.plumeAlpha }, { width: light.coreWidth, alpha: light.coreAlpha }].map((layer, i) => (
          <path key={i} ref={node => { paths.current[i] = node; }} d={initial.path} fill="none" stroke={`url(#${id}-trail)`}
            strokeWidth={layer.width} opacity={layer.alpha} strokeLinecap="round" filter={i === 0 ? `url(#${id}-soft)` : undefined} />
        ))}
        <g ref={head} className="marshmallow-meteor-head" transform={`translate(${flight.origin.x} ${flight.origin.y})`}>
          <circle r={rare ? 8 + flight.brightnessGain * 0.4 : 4} fill={plume} opacity={rare ? 0.12 : 0.07} filter={`url(#${id}-soft)`} />
          <circle r={rare ? 2.5 : 1.4} fill={color} opacity={light.headAlpha} />
          {rare && <path d="M-4.5 0H4.5M0-4.5V4.5" stroke={color} strokeWidth="0.6" opacity={light.headAlpha * 0.65} />}
          <circle r={rare ? 0.9 : 0.55} fill={dark ? '#fffaf0' : '#405772'} opacity={light.headAlpha} />
        </g>
      </g>
    </svg>
  );
}
