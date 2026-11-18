'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './sky-hints.css';

type HintKind = 'trails' | 'fire' | 'taste';
type Hint = { kind: HintKind; leaving: boolean; text?: string };
type CampfireState = { visible: boolean; fireOn: boolean; ready: boolean };

const SESSION_KEY = 'stars-above-hints-started';
const LEARNED_PREFIX = 'stars-above-learned-';
const HINT_MS = 6_000;
const FADE_MS = 200;
let sessionUsed = false;

interface SkyHintsValue {
  hint: Hint | null;
  touch: boolean;
  canStartTrails: boolean;
  dismiss: () => void;
  trailStarted: (reduced: boolean) => void;
  campfireChanged: (state: CampfireState) => void;
  fireClicked: (lighting: boolean) => void;
  tasteClicked: () => void;
  tasteCompleted: () => void;
}

const SkyHintsContext = createContext<SkyHintsValue>({
  hint: null, touch: false, canStartTrails: true,
  dismiss: () => {}, trailStarted: () => {}, campfireChanged: () => {},
  fireClicked: () => {}, tasteClicked: () => {}, tasteCompleted: () => {},
});

export function useSkyHints() {
  return useContext(SkyHintsContext);
}

export function SkyHintsProvider({ ready, holding, dragging, polarisVisible, children }: {
  ready: boolean;
  holding: boolean;
  dragging: boolean;
  polarisVisible?: boolean;
  children: ReactNode;
}) {
  const [hint, setHint] = useState<Hint | null>(null);
  const hintRef = useRef<Hint | null>(null);
  const [touch, setTouch] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [campfire, setCampfire] = useState<CampfireState>({ visible: false, fireOn: false, ready: false });
  const campfireRef = useRef(campfire);
  const activityRef = useRef({ ready, holding, dragging });
  activityRef.current = { ready, holding, dragging };
  const learned = useRef<Record<HintKind, boolean>>({ trails: false, fire: false, taste: false });
  const roundAllowed = useRef(false);
  const roundClaimed = useRef(false);
  const introEnded = useRef(false);
  const introStarted = useRef(false);
  const tasteChecked = useRef(false);
  const bootTimer = useRef(0);
  const expiryTimer = useRef(0);
  const fadeTimer = useRef(0);

  const claimRound = useCallback(() => {
    if (roundClaimed.current) return;
    roundClaimed.current = true;
    sessionUsed = true;
    try { window.sessionStorage.setItem(SESSION_KEY, '1'); }
    catch { /* The round remains recorded for this page session. */ }
  }, []);

  const learn = useCallback((kind: HintKind) => {
    if (learned.current[kind]) return;
    learned.current[kind] = true;
    try { window.localStorage.setItem(`${LEARNED_PREFIX}${kind}`, '1'); }
    catch { /* Learning remains recorded for this visit. */ }
  }, []);

  const retire = useCallback((after?: () => void) => {
    window.clearTimeout(expiryTimer.current);
    window.clearTimeout(fadeTimer.current);
    if (!hintRef.current) { after?.(); return; }
    const next = { ...hintRef.current, leaving: true };
    hintRef.current = next;
    setHint(next);
    fadeTimer.current = window.setTimeout(() => {
      hintRef.current = null;
      setHint(null);
      after?.();
    }, FADE_MS);
  }, []);

  const present = useCallback((kind: HintKind, after?: () => void, text?: string) => {
    window.clearTimeout(expiryTimer.current);
    window.clearTimeout(fadeTimer.current);
    const next = { kind, leaving: false, text };
    hintRef.current = next;
    setHint(next);
    expiryTimer.current = window.setTimeout(() => retire(after), HINT_MS);
  }, [retire]);

  const endIntro = useCallback(() => {
    introEnded.current = true;
    window.clearTimeout(bootTimer.current);
    retire();
  }, [retire]);

  const nextFire = useCallback(() => {
    const state = campfireRef.current;
    const activity = activityRef.current;
    if (introEnded.current || learned.current.fire || !state.visible || state.fireOn || activity.dragging || activity.holding) {
      introEnded.current = true;
      return;
    }
    present('fire', () => { introEnded.current = true; });
  }, [present]);

  useEffect(() => {
    for (const kind of ['trails', 'fire', 'taste'] as const) {
      try { learned.current[kind] = window.localStorage.getItem(`${LEARNED_PREFIX}${kind}`) === '1'; }
      catch { /* This visit still records successful actions. */ }
    }
    let used = sessionUsed;
    try { used ||= window.sessionStorage.getItem(SESSION_KEY) === '1'; }
    catch { /* The in-memory page session supplies the same limit. */ }
    roundAllowed.current = !used;
    introEnded.current = used;
    tasteChecked.current = used;
    setLoaded(true);
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setTouch(query.matches);
    update();
    query.addEventListener('change', update);
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      query.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !ready || !pageVisible || introStarted.current || introEnded.current || !roundAllowed.current || dragging || holding) return;
    bootTimer.current = window.setTimeout(() => {
      if (document.hidden) return;
      introStarted.current = true;
      claimRound();
      if (polarisVisible && !learned.current.trails) present('trails', nextFire);
      else nextFire();
    }, 1_000);
    return () => window.clearTimeout(bootTimer.current);
  }, [loaded, ready, pageVisible, dragging, holding, polarisVisible, claimRound, nextFire, present]);

  useEffect(() => {
    if (!polarisVisible && hintRef.current?.kind === 'trails' && !hintRef.current.leaving) retire(nextFire);
  }, [polarisVisible, retire, nextFire]);

  useEffect(() => {
    if (!pageVisible && hintRef.current) endIntro();
  }, [pageVisible, endIntro]);

  useEffect(() => {
    if (!dragging && !holding) return;
    claimRound();
    endIntro();
  }, [dragging, holding, claimRound, endIntro]);

  useEffect(() => {
    if (!holding || learned.current.trails) return;
    const timer = window.setTimeout(() => learn('trails'), 1_000);
    return () => window.clearTimeout(timer);
  }, [holding, learn]);

  useEffect(() => {
    if (campfire.visible) return;
    if (hintRef.current?.kind === 'fire' || hintRef.current?.kind === 'taste') endIntro();
  }, [campfire.visible, endIntro]);

  useEffect(() => {
    if (!loaded || !campfire.ready || tasteChecked.current) return;
    tasteChecked.current = true;
    if (!roundAllowed.current || learned.current.taste || !campfire.visible || dragging || holding) return;
    claimRound();
    introEnded.current = true;
    window.clearTimeout(bootTimer.current);
    retire(() => present('taste'));
  }, [loaded, campfire.ready, campfire.visible, dragging, holding, claimRound, present, retire]);

  useEffect(() => () => {
    window.clearTimeout(bootTimer.current);
    window.clearTimeout(expiryTimer.current);
    window.clearTimeout(fadeTimer.current);
  }, []);

  const trailStarted = useCallback((reduced: boolean) => {
    if (!activityRef.current.ready || activityRef.current.dragging) return;
    claimRound();
    endIntro();
    if (reduced) learn('trails');
  }, [claimRound, endIntro, learn]);

  const campfireChanged = useCallback((next: CampfireState) => {
    campfireRef.current = next;
    setCampfire(current => current.visible === next.visible && current.fireOn === next.fireOn && current.ready === next.ready ? current : next);
  }, []);

  const fireClicked = useCallback((lighting: boolean) => {
    claimRound();
    endIntro();
    if (lighting) learn('fire');
  }, [claimRound, endIntro, learn]);

  const tasteClicked = useCallback(() => { claimRound(); endIntro(); }, [claimRound, endIntro]);
  const tasteCompleted = useCallback(() => learn('taste'), [learn]);

  const value = useMemo(() => ({
    hint, touch, canStartTrails: ready && !dragging,
    dismiss: endIntro, trailStarted, campfireChanged, fireClicked, tasteClicked, tasteCompleted,
  }), [hint, touch, ready, dragging, endIntro, trailStarted, campfireChanged, fireClicked, tasteClicked, tasteCompleted]);

  return <SkyHintsContext.Provider value={value}>{children}</SkyHintsContext.Provider>;
}

export function SkyHint({ kind, children, className = '', style }: {
  kind: HintKind;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { hint, dismiss } = useSkyHints();
  if (hint?.kind !== kind) return null;
  const content = hint.text ?? children;
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
  return (
    <button type="button" className={`sky-discovery-hint ${className}`}
      data-leaving={hint.leaving} style={style}
      aria-label={`${typeof content === 'string' ? content : 'Sky hint'}. Dismiss hint`}
      onPointerDown={stop} onPointerUp={stop} onPointerMove={stop} onPointerCancel={stop}
      onClick={event => { event.stopPropagation(); dismiss(); }}>
      {content}
    </button>
  );
}
