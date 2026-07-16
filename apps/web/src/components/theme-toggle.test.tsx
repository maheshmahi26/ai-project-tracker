import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './theme-toggle';
import { useThemeStore } from '@/stores/theme-store';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ mode: 'system' });
  });

  it('renders an accessible toggle (light by default under stubbed matchMedia)', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it('flips the persisted theme mode and accessible name on click', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }));

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(useThemeStore.getState().mode).toBe('light');
  });
});
