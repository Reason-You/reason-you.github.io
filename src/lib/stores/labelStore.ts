import { create } from 'zustand';
import { reconcilePinnedIds, togglePinnedId } from '@/lib/sky/look-up';

interface LabelState {
  pinnedIds: number[];
  toggle: (id: number) => void;
  clearAll: () => void;
  reconcile: (available: number[]) => void;
}

/** Star names pinned by clicks; shared so the sky and the footer's clear button stay in step. */
export const useLabelStore = create<LabelState>((set) => ({
  pinnedIds: [],
  toggle: (id) => set((state) => ({ pinnedIds: togglePinnedId(state.pinnedIds, id) })),
  clearAll: () => set({ pinnedIds: [] }),
  reconcile: (available) => set((state) => {
    const pinnedIds = reconcilePinnedIds(state.pinnedIds, available);
    return pinnedIds.length === state.pinnedIds.length ? state : { pinnedIds };
  }),
}));
