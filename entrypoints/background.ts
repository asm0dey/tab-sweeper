import type { Message } from '@/lib/messages';
import { exclusive } from '@/lib/queue';
import { isRestorable, selectTabsToClose } from '@/lib/select';
import { idleMs, normalizeSettings, sweepPeriodMinutes } from '@/lib/settings';
import {
  getClockStart,
  getSettings,
  getTrash,
  setClockStart,
  setLastSweep,
  setSettings,
  setTrash,
} from '@/lib/store';
import { pushEntries, removeEntries, toEntry, trimTrash } from '@/lib/trash';

const isDev = import.meta.env.MODE === 'development';
const SWEEP = 'sweep';
const STARTUP_SWEEP = 'startup-sweep';

async function ensureAlarm() {
  const period = sweepPeriodMinutes(await getSettings(), isDev);
  const alarm = await browser.alarms.get(SWEEP);
  if (alarm?.periodInMinutes !== period) await browser.alarms.create(SWEEP, { periodInMinutes: period });
}

async function sweep() {
  const settings = await getSettings();
  if (!settings.enabled) return;
  const now = Date.now();
  const tabs = await browser.tabs.query({ windowType: 'normal' });
  const doomed = selectTabsToClose(tabs, now, idleMs(settings, isDev), await getClockStart());
  const entries = doomed
    .filter((t) => isRestorable(t.url))
    .map((t) => toEntry({ url: t.url!, title: t.title, favIconUrl: t.favIconUrl }, now, crypto.randomUUID()));
  // Trash first, so a failure between the two steps can't lose a tab.
  if (entries.length) await setTrash(pushEntries(await getTrash(), entries, settings.trashSize));
  const results = await Promise.allSettled(doomed.map((t) => browser.tabs.remove(t.id!)));
  await setLastSweep({ at: now, closed: results.filter((r) => r.status === 'fulfilled').length });
}

async function restore(ids: string[]) {
  const trash = await getTrash();
  const wanted = new Set(ids);
  const restored: string[] = [];
  for (const entry of trash.filter((e) => wanted.has(e.id))) {
    try {
      await browser.tabs.create({ url: entry.url, active: ids.length === 1 });
      restored.push(entry.id);
    } catch (err) {
      console.warn('Tab Sweeper: could not reopen', entry.url, err); // entry stays in the trash
    }
  }
  await setTrash(removeEntries(await getTrash(), restored));
}

async function updateSettings(patch: Message & { type: 'setSettings' }) {
  const before = await getSettings();
  const after = normalizeSettings({ ...before, ...patch.patch });
  await setSettings(after);
  if (!before.enabled && after.enabled) await setClockStart(Date.now());
  if (after.trashSize < before.trashSize) await setTrash(trimTrash(await getTrash(), after.trashSize));
  if (after.devMinutes !== before.devMinutes) await ensureAlarm();
}

async function handle(msg: Message) {
  switch (msg.type) {
    case 'restore':
      return restore(msg.ids);
    case 'clear':
      return setTrash([]);
    case 'setSettings':
      return updateSettings(msg);
  }
}

const logErrors = (p: Promise<unknown>) => p.catch((err) => console.error('Tab Sweeper:', err));

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') logErrors(exclusive(() => setClockStart(Date.now())));
  });
  browser.runtime.onStartup.addListener(() => {
    logErrors(exclusive(sweep));
    // Session restore can create tabs after onStartup; catch those too.
    browser.alarms.create(STARTUP_SWEEP, { delayInMinutes: 1 });
  });
  browser.alarms.onAlarm.addListener(({ name }) => {
    if (name === SWEEP || name === STARTUP_SWEEP) logErrors(exclusive(sweep));
  });
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    exclusive(() => handle(msg as Message)).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err) }),
    );
    return true; // keep the channel open for the async response (Chrome)
  });
  logErrors(exclusive(ensureAlarm));
});
