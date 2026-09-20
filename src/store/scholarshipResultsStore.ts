"use client";

import { create } from "zustand";
import type { Scholarship } from "@/lib/scholarship/types";
import type { SearchMeta } from "@/lib/scholarship/api-types";

interface ScholarshipResultsState {
  /** Live-discovered results keyed by scholarship id (includes web_ ids). */
  byId: Record<string, Scholarship>;
  lastMeta: SearchMeta | null;
  setResults: (scholarships: Scholarship[], meta: SearchMeta | null) => void;
  getById: (id: string) => Scholarship | null;
  clear: () => void;
}

export const useScholarshipResultsStore = create<ScholarshipResultsState>(
  (set, get) => ({
    byId: {},
    lastMeta: null,

    setResults: (scholarships, meta) => {
      const byId: Record<string, Scholarship> = {};
      for (const s of scholarships) byId[s.id] = s;
      set({ byId, lastMeta: meta });
    },

    getById: (id) => get().byId[id] ?? null,

    clear: () => set({ byId: {}, lastMeta: null }),
  }),
);