import { create } from 'zustand';
import { evaluateAchievements, type ConfirmedMarshmallow } from '../achievements/evaluate';
import { emptyAchievementRecord, loadAchievementRecord, saveAchievementRecord, type AchievementRecord } from '../achievements/persistence';
import type { AchievementId } from '../achievements/definitions';

interface AchievementState {
  record: AchievementRecord;
  hydrated: boolean;
  hydrate: () => void;
  discover: (event: ConfirmedMarshmallow) => AchievementId[];
}

/** Permanent discoveries only. The current fire and its count stay in Campfire. */
export const useAchievementStore = create<AchievementState>((set, get) => ({
  record: emptyAchievementRecord(),
  hydrated: false,
  hydrate: () => {
    if (!get().hydrated) set({ record: loadAchievementRecord(), hydrated: true });
  },
  discover: (event) => {
    get().hydrate();
    const previous = get().record;
    const ids = evaluateAchievements(event, Object.keys(previous.unlocked) as AchievementId[]);
    if (!ids.length) return [];
    const time = new Date().toISOString();
    const unlocked = { ...previous.unlocked };
    ids.forEach(id => { unlocked[id] = time; });
    const record: AchievementRecord = { version: 1, unlocked, recentId: ids[ids.length - 1] };
    set({ record });
    saveAchievementRecord(record);
    return ids;
  },
}));
