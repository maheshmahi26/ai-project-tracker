/**
 * Recursive character text splitter for RAG ingestion.
 *
 * Tokens are approximated as ~4 characters (good enough for chunk sizing without
 * pulling in a tokenizer). We split on progressively finer separators
 * (paragraph → line → sentence → word → char) so chunks respect natural
 * boundaries, then pack them up to `chunkTokens` with `overlapTokens` carried
 * across boundaries to preserve context (the spec's ~15% overlap).
 */

const CHARS_PER_TOKEN = 4;
const SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

export interface Chunk {
  text: string;
  index: number;
  tokens: number;
}

export interface ChunkOptions {
  chunkTokens: number;
  overlapTokens: number;
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Recursively break `text` into pieces no larger than `maxChars`. */
function splitRecursive(text: string, maxChars: number, sepIndex: number): string[] {
  if (text.length <= maxChars) return text.length > 0 ? [text] : [];

  const sep = SEPARATORS[sepIndex] ?? '';
  // Reached the char-level separator: hard-slice oversized atoms.
  if (sep === '') {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
    return out;
  }

  const parts = text.split(sep);
  const pieces: string[] = [];
  for (const part of parts) {
    const withSep = part + sep;
    if (withSep.length > maxChars) {
      pieces.push(...splitRecursive(part, maxChars, sepIndex + 1));
    } else if (withSep.trim().length > 0) {
      pieces.push(withSep);
    }
  }
  return pieces;
}

/** Pack fine-grained pieces into overlapping chunks up to the char budget. */
export function chunkText(raw: string, opts: ChunkOptions): Chunk[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const maxChars = Math.max(1, opts.chunkTokens * CHARS_PER_TOKEN);
  const overlapChars = Math.max(0, Math.min(opts.overlapTokens, opts.chunkTokens - 1)) * CHARS_PER_TOKEN;
  const pieces = splitRecursive(text, maxChars, 0);

  const chunks: Chunk[] = [];
  let buffer = '';
  let index = 0;

  const flush = (): void => {
    const trimmed = buffer.trim();
    if (!trimmed) return;
    chunks.push({ text: trimmed, index: index++, tokens: approxTokens(trimmed) });
  };

  for (const piece of pieces) {
    if (buffer.length + piece.length > maxChars && buffer.length > 0) {
      flush();
      // Carry the tail of the previous chunk forward as overlap.
      buffer = overlapChars > 0 ? buffer.slice(-overlapChars) : '';
    }
    buffer += piece;
  }
  flush();

  return chunks;
}
