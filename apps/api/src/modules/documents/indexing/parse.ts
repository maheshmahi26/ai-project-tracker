import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import type { DocumentSourceType } from '@ai-projectos/shared';

/**
 * Extracts plain text from an uploaded document by source type:
 *  - pdf  → `pdf-parse`
 *  - docx → `mammoth` (raw text)
 *  - md   → light markdown-strip to readable text
 *  - txt  → utf-8 decode
 * Returns normalized text ready for chunking.
 */
export async function parseDocument(
  sourceType: DocumentSourceType,
  buffer: Buffer,
): Promise<string> {
  switch (sourceType) {
    case 'pdf': {
      const parsed = await pdfParse(buffer);
      return normalize(parsed.text);
    }
    case 'docx': {
      const { value } = await mammoth.extractRawText({ buffer });
      return normalize(value);
    }
    case 'md':
      return normalize(stripMarkdown(buffer.toString('utf8')));
    case 'txt':
      return normalize(buffer.toString('utf8'));
    default:
      return '';
  }
}

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Removes the noisiest markdown syntax so embeddings focus on prose. */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '')) // keep code text, drop fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^#{1,6}\s+/gm, '') // heading markers
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/(\*\*|__|\*|_|`)/g, ''); // emphasis/inline code marks
}
