'use client';

import { useCallback, useEffect, useId, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSkyDirection } from './SkyDirection';
import { campfireReducer, INITIAL_CAMPFIRE } from '@/lib/achievements/session';
import { canBurnMarshmallow } from '@/lib/achievements/evaluate';
import { useAchievementStore } from '@/lib/stores/achievementStore';
import AchievementToast, { type CampfireMessage } from './AchievementToast';
import './campfire.css';

const EMBER_PATHS = [
  { left: '47%', drift: '-9px', rise: '-46px' },
  { left: '54%', drift: '12px', rise: '-38px' },
  { left: '50%', drift: '-3px', rise: '-53px' },
] as const;

// Marshmallow lifecycle while the fire burns:
//   idle → entering → roasting → ready → eating → entering → …
// Extinguishing falls back through retreat → idle from any phase. Each phase
// owns its pending timers; changing phase (or unmounting) clears them, so
// no roast can outlive the fire that started it. `round` remounts the stick so
// every marshmallow starts its keyframes from scratch.
const ENTER_DELAY_MS = 500; // the flames are visibly rising by then
const EAT_MS = 260;         // shrink + fade of the eaten marshmallow
const NEXT_MS = 500;        // from bite to the next stick entering
const RETREAT_MS = 260;     // fade-out when the fire goes out
const ROAST_MS = 1200;      // white → toasted while it turns
const ROAST_MS_REDUCED = 700;

interface Ember {
  id: number;
  path: number;
}

export default function Campfire() {
  const [session, dispatch] = useReducer(campfireReducer, INITIAL_CAMPFIRE);
  const { fireOn, phase, round, eaten, burnt, completion } = session;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { facing } = useSkyDirection();
  const [messages, setMessages] = useState<CampfireMessage[]>([]);
  const lastCompletion = useRef(completion);
  const hintedRound = useRef(-1);
  const dismissMessage = useCallback((key: string) => setMessages(current => current.filter(message => message.key !== key)), []);
  const [embers, setEmbers] = useState<Ember[]>([]);
  const emberId = useRef(0);
  const reducedMotion = useReducedMotion();
  const id = useId();

  useEffect(() => {
    const timers: number[] = [];
    const at = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const enterMs = reducedMotion ? 200 : 700;
    const roastMs = reducedMotion ? ROAST_MS_REDUCED : ROAST_MS;

    if (!fireOn) {
      if (phase === 'retreat') at(() => dispatch({ type: 'idle' }), RETREAT_MS);
    } else if (phase === 'idle') {
      at(() => dispatch({ type: 'enter' }), ENTER_DELAY_MS);
    } else if (phase === 'entering') {
      at(() => {
        const current = sessionRef.current;
        const eligible = canBurnMarshmallow(current.eaten + 1, current.eaten - current.ignitionStartCount + 1);
        dispatch({ type: 'roast', roll: eligible ? Math.random() : 1 });
      }, enterMs);
    } else if (phase === 'roasting') {
      at(() => dispatch({ type: 'ready' }), roastMs);
    } else if (phase === 'eating') {
      at(() => dispatch({ type: 'confirm' }), EAT_MS);
      at(() => dispatch({ type: 'enter' }), NEXT_MS);
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fireOn, phase, reducedMotion]);

  useEffect(() => {
    if (!completion || completion === lastCompletion.current) return;
    lastCompletion.current = completion;
    const ids = useAchievementStore.getState().discover(completion);
    setMessages(current => [
      ...(completion.eaten === 40 ? current.filter(message => message.type === 'achievement') : current),
      ...ids.map(id => ({ key: id, type: 'achievement' as const, id })),
    ]);
  }, [completion]);

  useEffect(() => {
    if (phase !== 'ready' || !burnt || hintedRound.current === round) return;
    hintedRound.current = round;
    setMessages(current => [...current, { key: `burnt-${round}`, type: 'burnt' }]);
  }, [phase, burnt, round]);

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

  // Only a rested, fully roasted marshmallow counts; clicks during any other
  // phase (or a second bite mid-animation) are ignored.
  const eatMarshmallow = () => {
    dispatch({ type: 'eat', facing });
  };

  const stopPropagation = (event: { stopPropagation(): void }) => event.stopPropagation();

  return (
    <>
      <AchievementToast message={messages[0]} quiet={eaten === 40} onDismiss={dismissMessage} />
      <div className="campfire-decoration" data-fire-on={fireOn} aria-hidden="true">
        <div className="campfire-glow"><div className="campfire-glow-breathe" /></div>
        <div className="campfire-hint" />
        {eaten > 0 && (
          <div className="campfire-count">
            {`Marshmallow${eaten > 1 ? 's' : ''} · ${eaten}`}
          </div>
        )}
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
          {phase !== 'idle' && (
            <div
              key={round}
              className={`campfire-marshmallow m-${phase}${reducedMotion ? ' m-reduced' : ''}`}
              data-burnt={burnt}
            >
              <svg viewBox="0 0 90 44" focusable="false" aria-hidden="true">
                <defs>
                  <radialGradient id={`${id}-caramel`} cx="0.35" cy="0.3" r="0.9">
                    <stop offset="0" stopColor="#b97b46" />
                    <stop offset="0.6" stopColor="#c99a63" stopOpacity="0.85" />
                    <stop offset="1" stopColor="#c99a63" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <line x1="88" y1="5" x2="30" y2="28" stroke="#8a6b4f" strokeWidth="2" strokeLinecap="round" />
                <g className="campfire-marshmallow-body">
                  <ellipse cx="26" cy="30" rx="8" ry="9.5" fill="#f4eee4" stroke="#d8cfc2" strokeWidth="0.7" />
                  <ellipse className="campfire-marshmallow-cream" cx="26" cy="30" rx="8" ry="9.5" fill="#e8d6b4" opacity="0" />
                  <ellipse className="campfire-marshmallow-caramel" cx="23" cy="27" rx="5.2" ry="6.2" fill={`url(#${id}-caramel)`} opacity="0" />
                  {burnt && <ellipse className="campfire-marshmallow-burnt" cx="22" cy="28" rx="3.8" ry="5" fill="#70492f" opacity="0" />}
                </g>
                {burnt && <path className="campfire-marshmallow-smoke" d="M24 19C20 15 27 12 23 8C21 6 23 3 25 1" fill="none" stroke="#94a3b8" strokeWidth="0.6" opacity="0" />}
              </svg>
            </div>
          )}
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
      {/* Stays mounted (disabled) through the bite animation so a fast
          second click lands here instead of the fire toggle beneath. */}
      {(phase === 'ready' || phase === 'eating') && (
        <button
          type="button"
          className="campfire-eat"
          aria-label="Eat roasted marshmallow"
          disabled={phase === 'eating'}
          onPointerDown={stopPropagation}
          onPointerUp={stopPropagation}
          onPointerMove={stopPropagation}
          onPointerLeave={stopPropagation}
          onClick={(event) => {
            event.stopPropagation();
            eatMarshmallow();
          }}
        />
      )}
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
          setMessages(current => current.filter(message => message.type === 'achievement'));
          dispatch({ type: 'toggle' });
        }}
      />
    </>
  );
}
