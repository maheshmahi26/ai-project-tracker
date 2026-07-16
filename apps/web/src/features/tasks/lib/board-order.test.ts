import { describe, expect, it } from 'vitest';
import { computeOrder } from './board-order';

describe('computeOrder (board reorder)', () => {
  const col = [{ order: 0 }, { order: 10 }, { order: 20 }];

  it('places a card between two neighbors at the midpoint', () => {
    expect(computeOrder(col, 1)).toBe(5); // between 0 and 10
    expect(computeOrder(col, 2)).toBe(15); // between 10 and 20
  });

  it('places a card at the top above the first neighbor', () => {
    expect(computeOrder(col, 0)).toBe(-1);
  });

  it('places a card at the bottom below the last neighbor', () => {
    expect(computeOrder(col, col.length)).toBe(21);
  });

  it('returns 0 for an empty destination column', () => {
    expect(computeOrder([], 0)).toBe(0);
  });
});
