import { describe, expect, it } from 'vitest';
import { parseDocument } from './parse';

describe('parseDocument', () => {
  it('passes plain text through, collapsing excessive blank lines', async () => {
    const text = await parseDocument('txt', Buffer.from('Hello\r\n\r\n\r\nWorld  \n'));
    expect(text).toBe('Hello\n\nWorld');
  });

  it('strips markdown syntax to readable prose', async () => {
    const md = [
      '# Heading',
      '',
      'Some **bold** and _italic_ and `code`.',
      '',
      '- a [link](https://example.com)',
      '![img](https://example.com/x.png)',
      '> a quote',
    ].join('\n');
    const text = await parseDocument('md', Buffer.from(md));

    expect(text).toContain('Heading');
    expect(text).toContain('Some bold and italic and code.');
    expect(text).toContain('a link');
    expect(text).not.toContain('#');
    expect(text).not.toContain('**');
    expect(text).not.toContain('https://example.com/x.png');
  });
});
