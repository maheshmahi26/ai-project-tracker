import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveTheme, useThemeStore } from '@/stores/theme-store';

/** Top-bar button that flips between light and dark. */
export function ThemeToggle(): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = resolveTheme(mode) === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title="Toggle theme"
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
