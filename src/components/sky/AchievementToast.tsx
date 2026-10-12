'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ACHIEVEMENTS, type AchievementId } from '@/lib/achievements/definitions';
import AchievementIcon from './AchievementIcon';

export type CampfireMessage = { key: string } & (
  | { type: 'achievement'; id: AchievementId }
  | { type: 'burnt' }
);

export default function AchievementToast({ message, quiet, onDismiss }: {
  message?: CampfireMessage;
  quiet: boolean;
  onDismiss: (key: string) => void;
}) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const key = message?.key;
  useEffect(() => {
    if (!key || quiet) return;
    setVisible(true);
    const hide = window.setTimeout(() => setVisible(false), 2500);
    const next = window.setTimeout(() => onDismiss(key), 2500 + (reduced ? 0 : 180));
    return () => { window.clearTimeout(hide); window.clearTimeout(next); };
  }, [key, quiet, reduced, onDismiss]);

  // The fortieth bite is silent; queued discoveries resume on the next bite.
  if (quiet) return null;
  const achievement = message?.type === 'achievement' ? ACHIEVEMENTS.find(a => a.id === message.id) : null;
  return (
    <div className="campfire-notifications" role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {message && visible && (
          <motion.div key={message.key} className="campfire-notification"
            initial={{ opacity: 0, y: reduced ? 0 : 3 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -2 }} transition={{ duration: reduced ? 0 : 0.18 }}>
            {achievement ? <>
              <p className="campfire-notification-caption">Achievement unlocked</p>
              <p className="campfire-notification-name"><AchievementIcon icon={achievement.icon} size={12} /><span>{achievement.name}</span></p>
            </> : <p>A little too close to the Sun.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
