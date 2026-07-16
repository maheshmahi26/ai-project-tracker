import { describe, expect, it } from 'vitest';
import { bodyToText, textToBody } from './comment-body';

describe('comment body serialization', () => {
  it('round-trips plain text through the doc structure', () => {
    const body = textToBody('Hello world');
    expect(bodyToText(body)).toBe('Hello world');
  });

  it('trims surrounding whitespace', () => {
    expect(bodyToText(textToBody('  spaced  '))).toBe('spaced');
  });

  it('produces an empty paragraph for empty input', () => {
    const body = textToBody('') as { content: Array<{ content?: unknown[] }> };
    expect(body.content[0]?.content).toEqual([]);
    expect(bodyToText(body)).toBe('');
  });
});
