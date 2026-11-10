import { expect, test } from 'bun:test';
import { isBlankTab, isRestorable, selectTabsToClose, type TabLike } from '../lib/select';

const H = 3_600_000;
const now = 100 * H;
const idle = 12 * H;
const tab = (o: Partial<TabLike>): TabLike => ({
  id: 1,
  url: 'https://a.test',
  pinned: false,
  active: false,
  audible: false,
  incognito: false,
  lastAccessed: 0,
  ...o,
});
const sel = (t: TabLike[]) => selectTabsToClose(t, now, idle, 0);

test('closes a tab idle longer than N', () => expect(sel([tab({ lastAccessed: now - 13 * H })])).toHaveLength(1));
test('keeps a tab idle exactly N or less', () => expect(sel([tab({ lastAccessed: now - 12 * H })])).toHaveLength(0));
test.each(['pinned', 'active', 'audible', 'incognito'])('never closes %s tabs', (k) =>
  expect(sel([tab({ [k]: true, lastAccessed: 0 })])).toHaveLength(0),
);
test('fresh clock: idle counts from clockStart when later than lastAccessed', () => {
  expect(selectTabsToClose([tab({ lastAccessed: 0 })], now, idle, now - 2 * H)).toHaveLength(0);
  expect(selectTabsToClose([tab({ lastAccessed: 0 })], now, idle, now - 13 * H)).toHaveLength(1);
});
test('restart carry-over: an old lastAccessed with an old clockStart closes', () =>
  expect(selectTabsToClose([tab({ lastAccessed: now - 60 * H })], now, idle, 0)).toHaveLength(1));
test('missing lastAccessed counts as just viewed', () => expect(sel([tab({ lastAccessed: undefined })])).toHaveLength(0));
test('missing id is skipped', () => expect(sel([tab({ id: undefined })])).toHaveLength(0));
test('unrestorable URLs are never closed', () => {
  for (const url of ['about:config', 'chrome://settings/', 'file:///x', 'moz-extension://x/p.html', undefined])
    expect(sel([tab({ url })])).toHaveLength(0);
});
test('blank new-tab pages are closed', () => {
  for (const url of ['about:blank', 'about:newtab', 'about:home', 'chrome://newtab/'])
    expect(sel([tab({ url })])).toHaveLength(1);
});
test('hidden tabs (other Zen workspaces) are not exempt', () =>
  expect(sel([{ ...tab({}), hidden: true } as TabLike])).toHaveLength(1));
test('returns the original tab objects', () => {
  const t = { ...tab({}), title: 'x' };
  expect(selectTabsToClose([t], now, idle, 0)[0]).toBe(t);
});
test('url classifiers', () => {
  expect(isRestorable('http://a.test')).toBe(true);
  expect(isRestorable('about:blank')).toBe(false);
  expect(isBlankTab('about:blank')).toBe(true);
  expect(isBlankTab('https://a.test')).toBe(false);
});

test('lastSeen keeps a tab the user just left (Chrome stamps lastAccessed only on activation)', () => {
  const t = tab({ id: 7, lastAccessed: now - 20 * H });
  expect(selectTabsToClose([t], now, idle, 0, { '7': now - 1 * H })).toHaveLength(0);
  expect(selectTabsToClose([t], now, idle, 0, { '7': now - 13 * H })).toHaveLength(1);
});
