import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WidgetState } from './widget-state';

describe('WidgetState', () => {
  it('renders a skeleton while loading', () => {
    const { container } = render(
      <WidgetState isLoading isError={false} isEmpty={false}>
        <div>chart</div>
      </WidgetState>,
    );
    expect(screen.queryByText('chart')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders an error message on error', () => {
    render(
      <WidgetState isLoading={false} isError isEmpty={false}>
        <div>chart</div>
      </WidgetState>,
    );
    expect(screen.getByText(/couldn't load this widget/i)).toBeInTheDocument();
    expect(screen.queryByText('chart')).not.toBeInTheDocument();
  });

  it('renders the empty label when empty', () => {
    render(
      <WidgetState isLoading={false} isError={false} isEmpty emptyLabel="Nothing here">
        <div>chart</div>
      </WidgetState>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders children when loaded with data', () => {
    render(
      <WidgetState isLoading={false} isError={false} isEmpty={false}>
        <div>chart</div>
      </WidgetState>,
    );
    expect(screen.getByText('chart')).toBeInTheDocument();
  });
});
