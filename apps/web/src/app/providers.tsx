import { useState, type ReactNode } from 'react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from './theme-provider';
import { ApiClientError } from '@/lib/api-client';

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Don't retry client errors (4xx); retry transient server/network errors twice.
        retry: (failureCount, error) => {
          if (error instanceof ApiClientError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
    // Surface query failures as toasts (mutations toast at the call site too).
    queryCache: new QueryCache({
      onError: (error) => toast.error(messageFor(error)),
    }),
    mutationCache: new MutationCache({
      onError: (error) => toast.error(messageFor(error)),
    }),
  });
}

/** App-wide providers: Query, Theme, Tooltips, Toaster. */
export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
