// Everything the background does, as plain async functions. The background entrypoint only wires
// browser events to these and runs each one through exclusive().
import { browser } from 'wxt/browser';
import type { Message } from './messages';
import { noteActivation, noteSweep } from './seen';
import { isRestorable, selectTabsToClose } from './select';
import { idleMs, normalizeSettings, sweepPeriodMinutes, type Settings } from './settings';
import {
  getClockStart,
  getSeen,
  getSettings,
  getTrash,
  setClockStart,
  setLastSweep,
  setSeen,
  setSettings,
  setTrash,
} from './store';
import { dropReswept, pushEntries, removeEntries, toEntry, trimTrash } from './trash';

export const SWEEP_ALARM = 'sweep';
export const STARTUP_SWEEP_ALARM = 'startup-sweep';

export async function ensureAlarm(isDev: boolean) {
  const period = sweepPeriodMinutes(await getSettings(), isDev);
  const alarm = await browser.alarms.get(SWEEP_ALARM);
  if (alarm?.periodInMinutes !== period) await browser.alarms.create(SWEEP_ALARM, { periodInMinutes: period });
}

export async function onInstalled(reason: string) {
  if (reason === 'install') await setClockStart(Date.now());
}

export async function onActivated(windowId: number, tabId: number) {
  await setSeen(noteActivation(await getSeen(), windowId, tabId, Date.now()));
}

export async function sweep(isDev: boolean) {
  const settings = await getSettings();
  if (!settings.enabled) return;
  const now = Date.now();
  const clockStart = await getClockStart();
  if (clockStart === undefined) {
    await setClockStart(now); // never closed anything yet: start the clock rather than mass-close
    return;
  }
  const tabs = await browser.tabs.query({ windowType: 'normal' });
  const seen = noteSweep(await getSeen(), tabs, now);
  await setSeen(seen);
  const doomed = selectTabsToClose(tabs, now, idleMs(settings, isDev), clockStart, seen.lastSeen);
  const entries = new Map(
    doomed
      .filter((t) => isRestorable(t.url))
      .map((t) => [t.id!, toEntry({ id: t.id, url: t.url!, title: t.title, favIconUrl: t.favIconUrl }, now, crypto.randomUUID())]),
  );
  // Trash first, so a failure between the two steps can't lose a tab.
  if (entries.size) await setTrash(pushEntries(dropReswept(await getTrash(), doomed), [...entries.values()], settings.trashSize));
  const results = await Promise.allSettled(doomed.map((t) => browser.tabs.remove(t.id!)));
  const stillOpen = doomed.filter((_, i) => results[i]?.status === 'rejected');
  const orphaned = stillOpen.flatMap((t) => entries.get(t.id!)?.id ?? []);
  if (orphaned.length) await setTrash(removeEntries(await getTrash(), orphaned));
  await setLastSweep({ at: now, closed: doomed.length - stillOpen.length });
}

export async function restore(ids: string[]) {
  const wanted = new Set(ids);
  const restored: string[] = [];
  for (const entry of (await getTrash()).filter((e) => wanted.has(e.id))) {
    try {
      await browser.tabs.create({ url: entry.url, active: ids.length === 1 });
      restored.push(entry.id);
    } catch (err) {
      console.warn('Tab Sweeper: could not reopen', entry.url, err); // entry stays in the trash
    }
  }
  await setTrash(removeEntries(await getTrash(), restored));
}

export async function updateSettings(patch: Partial<Settings>, isDev: boolean) {
  const before = await getSettings();
  const after = normalizeSettings({ ...before, ...patch });
  await setSettings(after);
  if (!before.enabled && after.enabled) await setClockStart(Date.now());
  if (after.trashSize < before.trashSize) await setTrash(trimTrash(await getTrash(), after.trashSize));
  if (after.devMinutes !== before.devMinutes) await ensureAlarm(isDev);
}

export async function handle(msg: Message, isDev: boolean) {
  switch (msg.type) {
    case 'restore':
      return restore(msg.ids);
    case 'clear':
      return setTrash([]);
    case 'setSettings':
      return updateSettings(msg.patch, isDev);
  }
}
