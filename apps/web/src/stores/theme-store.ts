import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Flip between light and dark (resolving `system` to its current value first). */
  toggle: () => void;
}

/** Resolve a mode to the concrete theme, honoring the OS preference for `system`. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
      toggle: () => set({ mode: resolveTheme(get().mode) === 'dark' ? 'light' : 'dark' }),
    }),
    {
      name: 'apos.theme',
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
