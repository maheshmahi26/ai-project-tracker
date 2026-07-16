import { useEffect, type ReactNode } from 'react';
import { resolveTheme, useThemeStore } from '@/stores/theme-store';

/**
 * Applies the `.dark` class on <html> from the persisted theme store and keeps
 * it in sync with the OS preference while in `system` mode. The initial class is
 * set by an inline script in index.html to avoid a flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    const apply = (): void => {
      document.documentElement.classList.toggle('dark', resolveTheme(mode) === 'dark');
    };
    apply();

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    return undefined;
  }, [mode]);

  return <>{children}</>;
}
