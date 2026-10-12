import { ACHIEVEMENTS, ACHIEVEMENT_STORAGE_KEY, isAchievementId, type AchievementId } from './definitions';

export interface AchievementRecord {
  version: 1;
  unlocked: Partial<Record<AchievementId, string>>;
  recentId: AchievementId | null;
}
export const emptyAchievementRecord = (): AchievementRecord => ({ version: 1, unlocked: {}, recentId: null });

type StorageProvider = () => Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage: StorageProvider = () => window.localStorage;

/** Only this schema and known discoveries are restored; older data starts a new log. */
export function parseAchievementRecord(value: unknown): AchievementRecord {
  const record = emptyAchievementRecord();
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 ||
      !('unlocked' in value) || typeof value.unlocked !== 'object' || value.unlocked === null) return record;
  for (const { id } of ACHIEVEMENTS) {
    const time = (value.unlocked as Record<string, unknown>)[id];
    if (typeof time === 'string' && Number.isFinite(Date.parse(time))) record.unlocked[id] = time;
  }
  const recent = 'recentId' in value ? value.recentId : null;
  record.recentId = isAchievementId(recent) && record.unlocked[recent] ? recent :
    (Object.keys(record.unlocked) as AchievementId[]).sort((a, b) => Date.parse(record.unlocked[a]!) - Date.parse(record.unlocked[b]!)).at(-1) ?? null;
  return record;
}

export function loadAchievementRecord(storage: StorageProvider = browserStorage): AchievementRecord {
  try { return parseAchievementRecord(JSON.parse(storage().getItem(ACHIEVEMENT_STORAGE_KEY) ?? 'null')); }
  catch { return emptyAchievementRecord(); }
}

/** Storage failure keeps the in-memory log usable. */
export function saveAchievementRecord(record: AchievementRecord, storage: StorageProvider = browserStorage): boolean {
  try { storage().setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(record)); return true; }
  catch { return false; }
}
