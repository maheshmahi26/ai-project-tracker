import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { resolveTheme, useThemeStore } from '@/stores/theme-store';

/** Toast host wired to the app's theme store. Rendered once in providers. */
export function Toaster(props: ToasterProps): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode);
  return (
    <Sonner
      theme={resolveTheme(mode)}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
