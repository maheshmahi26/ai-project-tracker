import { describe, expect, it } from 'vitest';
import { approxTokens, chunkText } from './chunk';

describe('chunkText', () => {
  it('returns no chunks for empty/whitespace input', () => {
    expect(chunkText('', { chunkTokens: 100, overlapTokens: 10 })).toEqual([]);
    expect(chunkText('   \n\n  ', { chunkTokens: 100, overlapTokens: 10 })).toEqual([]);
  });

  it('keeps a short document as a single chunk', () => {
    const chunks = chunkText('A short note.', { chunkTokens: 100, overlapTokens: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.index).toBe(0);
    expect(chunks[0]?.text).toBe('A short note.');
  });

  it('splits a long document into multiple sequential chunks within the size budget', () => {
    const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(40);
    const chunkTokens = 60; // ~240 chars
    const chunks = chunkText(paragraph, { chunkTokens, overlapTokens: 12 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
    // Each chunk should stay near the char budget (allow slack for separators).
    const maxChars = chunkTokens * 4;
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(maxChars + 20);
  });

  it('carries overlap text across chunk boundaries', () => {
    // Distinct sentences so we can detect shared context between neighbours.
    const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} has some words.`).join(' ');
    const chunks = chunkText(text, { chunkTokens: 40, overlapTokens: 15 });
    expect(chunks.length).toBeGreaterThan(1);

    // The tail of chunk[0] should reappear at the head of chunk[1] (overlap).
    const tail = chunks[0]!.text.slice(-20);
    expect(chunks[1]!.text.includes(tail.trim().split(' ')[0]!)).toBe(true);
  });

  it('approxTokens scales with length', () => {
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('a'.repeat(400))).toBe(100);
  });
});
