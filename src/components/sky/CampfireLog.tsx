'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ACHIEVEMENTS, type AchievementId } from '@/lib/achievements/definitions';
import { useAchievementStore } from '@/lib/stores/achievementStore';
import AchievementIcon from './AchievementIcon';
import './campfire-log.css';

export default function CampfireLog({ skyHeight }: { skyHeight?: number }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<AchievementId | null>(null);
  const record = useAchievementStore(state => state.record);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const id = useId();
  const close = useCallback(() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => { useAchievementStore.getState().hydrate(); }, []);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
    const outside = (event: globalThis.PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open, close]);

  const effectiveSelectedId = selectedId && record.unlocked[selectedId] ? selectedId : record.recentId;
  const selected = ACHIEVEMENTS.find(a => a.id === effectiveSelectedId && record.unlocked[a.id]);
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
  return (
    <div ref={wrapper} className="campfire-log-control" onPointerDown={stop} onPointerUp={stop}
      onPointerMove={stop} onPointerLeave={stop} onClick={stop} onWheel={stop}>
      <button ref={trigger} type="button" className="campfire-log-trigger" aria-expanded={open}
        aria-controls={`${id}-panel`} aria-haspopup="dialog"
        onClick={() => {
          if (open) close();
          else { setSelectedId(record.recentId); setOpen(true); }
        }}>Achievements</button>
      <AnimatePresence>
        {open && (
          <motion.div id={`${id}-panel`} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}
            className="campfire-log" style={skyHeight ? { maxHeight: Math.min(440, skyHeight * 0.65) } : undefined}
            initial={{ opacity: 0, y: reduced ? 0 : -3 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -3 }} transition={{ duration: reduced ? 0 : 0.18 }}>
            <header className="campfire-log-header">
              <h2 id={`${id}-title`}>Campfire Log</h2>
              <span className="campfire-log-total">{Object.keys(record.unlocked).length} / 12 discovered</span>
              <button ref={closeButton} type="button" className="campfire-log-close" aria-label="Close Campfire Log" onClick={close}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
              </button>
            </header>
            <section className="campfire-log-selection" aria-live="polite" aria-atomic="true">
              {selected ? <>
                <p className="campfire-log-caption">SELECTED DISCOVERY</p>
                <div className="campfire-log-selected-name">
                  <AchievementIcon icon={selected.icon} size={18} />
                  <h3>{selected.name}</h3>
                </div>
                <p className="campfire-log-description">{selected.description}</p>
              </> : <p className="campfire-log-empty">No discoveries yet.</p>}
            </section>
            <ul className="campfire-discoveries" aria-label="Discoveries">
              {ACHIEVEMENTS.map(achievement => (
                <li key={achievement.id}>
                  {record.unlocked[achievement.id] ? (
                    <button type="button" className="campfire-discovery" aria-pressed={effectiveSelectedId === achievement.id}
                      onClick={() => setSelectedId(achievement.id)}>
                      <AchievementIcon icon={achievement.icon} />
                      {achievement.type === 'quantity' && <span className="campfire-discovery-count">{achievement.milestone}</span>}
                      <span>{achievement.name}</span>
                    </button>
                  ) : <span className="campfire-discovery-locked">???</span>}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
