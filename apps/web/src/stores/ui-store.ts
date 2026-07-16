import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  /** Sidebar collapsed (icons only). Persisted so it survives reloads. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  /** Command palette (⌘K) open state — ephemeral. */
  commandOpen: boolean;
  setCommandOpen: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),

      commandOpen: false,
      setCommandOpen: (value) => set({ commandOpen: value }),
    }),
    {
      name: 'apos.ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
