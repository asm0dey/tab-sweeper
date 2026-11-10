import { expect, test } from 'bun:test';
import {
  filterTrash,
  groupByDay,
  pushEntries,
  removeEntries,
  toEntry,
  trimTrash,
  type TrashEntry,
} from '../lib/trash';

const e = (id: string, closedAt: number): TrashEntry => ({ id, url: `https://${id}.test`, title: id, closedAt });
const at = (y: number, m: number, d: number, h: number) => e(`${d}-${h}`, new Date(y, m, d, h).getTime());
const ids = (t: TrashEntry[]) => t.map((x) => x.id);

test('push puts new entries first and drops the oldest past max', () =>
  expect(ids(pushEntries([e('a', 3), e('b', 2), e('c', 1)], [e('n', 4)], 3))).toEqual(['n', 'a', 'b']));

test('trim keeps the newest max', () => expect(ids(trimTrash([e('a', 3), e('b', 2), e('c', 1)], 2))).toEqual(['a', 'b']));

test('remove by id', () => expect(ids(removeEntries([e('a', 1), e('b', 2)], ['a']))).toEqual(['b']));

test('filter matches title or url, case-insensitive; blank query returns all', () => {
  const t = [
    { ...e('a', 1), title: 'Zen Docs', url: 'https://zen.test' },
    { ...e('b', 1), title: 'Other', url: 'https://x.test/ZEN' },
    e('c', 1),
  ];
  expect(ids(filterTrash(t, 'zen'))).toEqual(['a', 'b']);
  expect(filterTrash(t, '   ')).toHaveLength(3);
});

test('toEntry drops data: favicons and falls back to url for empty titles', () =>
  expect(toEntry({ url: 'https://a.test', title: '', favIconUrl: 'data:image/png;base64,AAA' }, 5, 'id')).toEqual({
    id: 'id',
    url: 'https://a.test',
    title: 'https://a.test',
    favIconUrl: undefined,
    closedAt: 5,
  }));

test('toEntry keeps http(s) favicons', () =>
  expect(toEntry({ url: 'https://a.test', title: 'A', favIconUrl: 'https://a.test/f.ico' }, 5, 'id').favIconUrl).toBe(
    'https://a.test/f.ico',
  ));

test('groups by local day with Today/Yesterday/date labels', () => {
  const now = new Date(2026, 10, 10, 14, 0).getTime();
  const g = groupByDay([at(2026, 10, 10, 9), at(2026, 10, 10, 8), at(2026, 10, 9, 23), at(2026, 10, 8, 10)], now, 'en-GB');
  expect(g.map((x) => x.label)).toEqual(['Today', 'Yesterday', 'Sun 8 Nov']);
  expect(g.map((x) => x.entries.length)).toEqual([2, 1, 1]);
});
