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

  /** Floating AI assistant widget open state — ephemeral. */
  assistantWidgetOpen: boolean;
  setAssistantWidgetOpen: (value: boolean) => void;
  toggleAssistantWidget: () => void;

  /** Session currently shown in the floating widget (null = pick/most-recent). */
  assistantWidgetSessionId: string | null;
  setAssistantWidgetSessionId: (value: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),

      commandOpen: false,
      setCommandOpen: (value) => set({ commandOpen: value }),

      assistantWidgetOpen: false,
      setAssistantWidgetOpen: (value) => set({ assistantWidgetOpen: value }),
      toggleAssistantWidget: () => set({ assistantWidgetOpen: !get().assistantWidgetOpen }),

      assistantWidgetSessionId: null,
      setAssistantWidgetSessionId: (value) => set({ assistantWidgetSessionId: value }),
    }),
    {
      name: 'apos.ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
