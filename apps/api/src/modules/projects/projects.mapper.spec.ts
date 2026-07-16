import { describe, expect, it } from 'vitest';
import { deriveKeyBase } from './projects.mapper';

describe('deriveKeyBase', () => {
  it('takes up to 4 letters for a single word', () => {
    expect(deriveKeyBase('Authentication')).toBe('AUTH');
    expect(deriveKeyBase('Billing')).toBe('BILL');
  });

  it('uses initials for multi-word names', () => {
    expect(deriveKeyBase('Auth Service')).toBe('AS');
    expect(deriveKeyBase('Customer Relationship Manager Platform')).toBe('CRMP');
  });

  it('strips punctuation and normalizes case', () => {
    expect(deriveKeyBase('  my-cool.project ')).toBe('MYCO');
  });

  it('always starts with a letter and is at least 2 chars', () => {
    const numeric = deriveKeyBase('123');
    expect(numeric).toMatch(/^[A-Z][A-Z0-9]{1,9}$/);
    const empty = deriveKeyBase('!!!');
    expect(empty).toMatch(/^[A-Z][A-Z0-9]{1,9}$/);
  });

  it('caps length at 10', () => {
    expect(deriveKeyBase('Supercalifragilistic').length).toBeLessThanOrEqual(10);
  });
});
