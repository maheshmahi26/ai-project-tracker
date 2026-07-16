import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OrgState {
  /**
   * The active organization id. Persisted so a returning user lands back in the
   * same workspace. The org list itself is server state (TanStack Query); this
   * store only remembers the *selection*.
   */
  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
  clear: () => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      activeOrgId: null,
      setActiveOrgId: (id) => set({ activeOrgId: id }),
      clear: () => set({ activeOrgId: null }),
    }),
    { name: 'apos.org' },
  ),
);
