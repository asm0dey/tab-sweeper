import * as actions from '@/lib/actions';
import type { Message } from '@/lib/messages';
import { exclusive } from '@/lib/queue';

const isDev = import.meta.env.MODE === 'development';
const run = (fn: () => Promise<unknown>) => exclusive(fn).catch((err) => console.error('Tab Sweeper:', err));

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => run(() => actions.onInstalled(reason)));
  browser.runtime.onStartup.addListener(() => {
    run(() => actions.sweep(isDev));
    // Session restore can create tabs after onStartup; catch those too.
    browser.alarms.create(actions.STARTUP_SWEEP_ALARM, { delayInMinutes: 1 });
  });
  browser.tabs.onActivated.addListener(({ windowId, tabId }) => run(() => actions.onActivated(windowId, tabId)));
  browser.alarms.onAlarm.addListener(({ name }) => {
    if (name === actions.SWEEP_ALARM || name === actions.STARTUP_SWEEP_ALARM) run(() => actions.sweep(isDev));
  });
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    exclusive(() => actions.handle(msg as Message, isDev)).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err) }),
    );
    return true; // keep the channel open for the async response (Chrome)
  });
  run(() => actions.ensureAlarm(isDev));
});
