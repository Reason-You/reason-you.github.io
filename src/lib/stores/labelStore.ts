import { create } from 'zustand';
import { reconcilePinnedIds } from '@/lib/sky/look-up';
import { toggleConstellationSelection } from '@/lib/sky/constellations';

interface LabelState {
  pinnedIds: number[];
  constellationIds: string[];
  toggle: (id: number) => void;
  clearAll: () => void;
  reconcile: (available: number[]) => void;
}

/** Star names pinned by clicks; shared so the sky and the footer's clear button stay in step. */
export const useLabelStore = create<LabelState>((set) => ({
  pinnedIds: [],
  constellationIds: [],
  toggle: (id) => set((state) => toggleConstellationSelection(state.pinnedIds, state.constellationIds, id)),
  clearAll: () => set({ pinnedIds: [], constellationIds: [] }),
  reconcile: (available) => set((state) => {
    const pinnedIds = reconcilePinnedIds(state.pinnedIds, available);
    return pinnedIds.length === state.pinnedIds.length ? state : {
      pinnedIds, constellationIds: pinnedIds.length === 0 ? [] : state.constellationIds,
    };
  }),
}));
