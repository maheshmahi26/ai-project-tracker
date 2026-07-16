/**
 * Comment bodies are stored as a minimal ProseMirror/TipTap-compatible JSON doc
 * so the schema is forward-compatible with a richer editor later. For now we
 * serialize plain text into a single paragraph and read it back out.
 */
export function textToBody(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: trimmed ? [{ type: 'text', text: trimmed }] : [],
      },
    ],
  };
}

interface Node {
  type?: string;
  text?: string;
  content?: Node[];
}

export function bodyToText(body: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) {
      node.content.forEach((child, i) => {
        walk(child);
        if (child.type === 'paragraph' && i < (node.content?.length ?? 0) - 1) parts.push('\n');
      });
    }
  };
  walk(body as Node);
  return parts.join('').trim();
}
