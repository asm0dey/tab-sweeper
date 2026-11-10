// Background orchestration against a fake browser at the module boundary (wxt/browser).
import { beforeEach, expect, mock, test } from 'bun:test';

const H = 3_600_000;
interface FakeTab {
  id: number;
  windowId: number;
  url: string;
  title: string;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  incognito: boolean;
  lastAccessed: number;
}
let store: Record<string, unknown>;
let tabs: FakeTab[];
let failRemove: Set<number>;
let created: string[];

const fake = {
  storage: {
    local: {
      get: async (key: string) => (key in store ? { [key]: structuredClone(store[key]) } : {}),
      set: async (o: Record<string, unknown>) => void Object.assign(store, structuredClone(o)),
    },
  },
  tabs: {
    query: async () => structuredClone(tabs),
    remove: async (id: number) => {
      if (failRemove.has(id)) throw new Error('Tabs cannot be edited right now');
      tabs = tabs.filter((t) => t.id !== id);
    },
    create: async ({ url }: { url: string }) => {
      if (url.includes('broken')) throw new Error('Illegal URL');
      created.push(url);
    },
  },
  alarms: { get: async () => undefined, create: async () => {} },
};
mock.module('wxt/browser', () => ({ browser: fake }));
const actions = await import('../lib/actions');

const tab = (id: number, o: Partial<FakeTab> = {}): FakeTab => ({
  id,
  windowId: 1,
  url: `https://t${id}.test`,
  title: `T${id}`,
  pinned: false,
  active: false,
  audible: false,
  incognito: false,
  lastAccessed: Date.now() - 20 * H,
  ...o,
});
const trash = () => (store.trash ?? []) as { id: string; url: string }[];

beforeEach(() => {
  store = { clockStart: 0 };
  tabs = [];
  failRemove = new Set();
  created = [];
});

test('sweep closes an idle tab and trashes it first', async () => {
  tabs = [tab(1), tab(2, { active: true })];
  await actions.sweep(false);
  expect(tabs.map((t) => t.id)).toEqual([2]);
  expect(trash().map((e) => e.url)).toEqual(['https://t1.test']);
  expect(store.lastSweep).toMatchObject({ closed: 1 });
});

test('missing clockStart starts the clock instead of closing everything', async () => {
  store = {};
  tabs = [tab(1)];
  await actions.sweep(false);
  expect(tabs).toHaveLength(1);
  expect(store.clockStart).toBeGreaterThan(Date.now() - 1000);
});

test('a tab that fails to close leaves no trash entry, and is not duplicated on the next sweep', async () => {
  tabs = [tab(1)];
  failRemove.add(1);
  await actions.sweep(false);
  expect(trash()).toHaveLength(0);
  failRemove.clear();
  await actions.sweep(false);
  expect(trash()).toHaveLength(1);
});

test('an entry left by an interrupted sweep is replaced, not duplicated', async () => {
  tabs = [tab(1)];
  store.trash = [{ id: 'stale', tabId: 1, url: 'https://t1.test', title: 'T1', closedAt: 1 }];
  await actions.sweep(false);
  expect(trash()).toHaveLength(1);
  expect(trash()[0]?.id).not.toBe('stale');
});

test('a tab the user just switched away from is kept even if Chrome says it was activated long ago', async () => {
  tabs = [tab(1, { active: true }), tab(2)];
  await actions.onActivated(1, 1);
  tabs = [tab(1, { active: false }), tab(2, { active: true })];
  await actions.onActivated(1, 2); // user leaves tab 1 now
  await actions.sweep(false);
  expect(tabs.map((t) => t.id)).toEqual([1, 2]);
});

test('restore reopens what it can and keeps entries that fail to open', async () => {
  store.trash = [
    { id: 'a', url: 'https://ok.test', title: 'ok', closedAt: 2 },
    { id: 'b', url: 'https://broken.test', title: 'broken', closedAt: 1 },
  ];
  await actions.restore(['a', 'b']);
  expect(created).toEqual(['https://ok.test']);
  expect(trash().map((e) => e.id)).toEqual(['b']);
});

test('turning Auto-close back on restarts the clock; lowering trash size trims', async () => {
  store.settings = { enabled: false, idleHours: 12, trashSize: 200, devMinutes: false };
  store.trash = Array.from({ length: 30 }, (_, i) => ({ id: String(i), url: 'https://x.test', title: 'x', closedAt: i }));
  await actions.updateSettings({ enabled: true, trashSize: 10 }, false);
  expect(store.clockStart).toBeGreaterThan(Date.now() - 1000);
  expect(trash()).toHaveLength(10);
});

test('a disabled sweep does nothing', async () => {
  store.settings = { enabled: false };
  tabs = [tab(1)];
  await actions.sweep(false);
  expect(tabs).toHaveLength(1);
});
