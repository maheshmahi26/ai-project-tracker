import { describe, expect, it } from 'vitest';
import { extractDeepLinks } from './deep-links';

describe('extractDeepLinks', () => {
  it('builds a link from a task summary using its key + url', () => {
    const links = extractDeepLinks({ id: '1', key: 'AUTH-124', title: 'Fix', url: '/tasks/1' });
    expect(links).toEqual([{ label: 'AUTH-124', to: '/tasks/1' }]);
  });

  it('falls back to name then a generic label', () => {
    expect(extractDeepLinks({ name: 'Website', url: '/projects/9' })).toEqual([
      { label: 'Website', to: '/projects/9' },
    ]);
    expect(extractDeepLinks({ url: '/tasks/2' })).toEqual([{ label: 'Open', to: '/tasks/2' }]);
  });

  it('extracts links from a list result and dedupes by url', () => {
    const links = extractDeepLinks({
      items: [
        { key: 'A-1', url: '/tasks/1' },
        { key: 'A-2', url: '/tasks/2' },
        { key: 'A-1-dup', url: '/tasks/1' },
      ],
    });
    expect(links).toEqual([
      { label: 'A-1', to: '/tasks/1' },
      { label: 'A-2', to: '/tasks/2' },
    ]);
  });

  it('caps the number of links returned', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ key: `K-${i}`, url: `/tasks/${i}` }));
    expect(extractDeepLinks({ items }, 3)).toHaveLength(3);
  });

  it('returns nothing for results without a url', () => {
    expect(extractDeepLinks({ deleted: true, id: 'x' })).toEqual([]);
    expect(extractDeepLinks(null)).toEqual([]);
    expect(extractDeepLinks('nope')).toEqual([]);
  });
});
