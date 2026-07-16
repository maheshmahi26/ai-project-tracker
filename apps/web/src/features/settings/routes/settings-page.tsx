import { Monitor, Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useThemeStore, type ThemeMode } from '@/stores/theme-store';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string; icon: typeof Sun }> = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
];

export default function SettingsPage(): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Account, organization, and members settings arrive with auth (TASK-06).
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how AI ProjectOS looks on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => setMode(option.mode)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mode === option.mode && 'border-primary ring-2 ring-primary/30',
                )}
              >
                <option.icon className="size-5" />
                {option.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
