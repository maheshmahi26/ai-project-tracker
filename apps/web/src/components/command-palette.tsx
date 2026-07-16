import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, FolderKanban, LayoutDashboard, Settings, SunMoon } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useUiStore } from '@/stores/ui-store';
import { useThemeStore } from '@/stores/theme-store';

/** Global ⌘K / Ctrl-K command palette. Mounted once inside the app shell. */
export function CommandPalette(): React.JSX.Element {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandOpen);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  const go = (path: string): void => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go('/')}>
            <LayoutDashboard />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go('/projects')}>
            <FolderKanban />
            Projects
          </CommandItem>
          <CommandItem onSelect={() => go('/tasks')}>
            <CheckSquare />
            Tasks
          </CommandItem>
          <CommandItem onSelect={() => go('/settings')}>
            <Settings />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() => {
              toggleTheme();
              setOpen(false);
            }}
          >
            <SunMoon />
            Toggle theme
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
