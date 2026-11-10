# Tab Sweeper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Zen/Firefox + Chrome/Chromium/Brave extension that closes tabs idle longer than N hours, never touches
pinned tabs or Essentials, and keeps the last M auto-closed tabs in a restorable trash bin.

**Architecture:** WXT project. All decision logic lives in pure, browser-free modules under `lib/` (unit-tested
with `bun test`). A thin background script owns every storage write and every tab close/open, serialized through
one in-memory queue. The popup only reads storage and sends messages to the background.

**Tech Stack:** WXT (latest), TypeScript, bun (pinned in `mise.toml`), plain DOM popup, `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-10-tab-sweeper-design.md`

## Global Constraints

- Permissions exactly: `tabs`, `storage`, `alarms`. No `incognito` access, no host permissions.
- Only cross-browser `browser.*` from `wxt/browser`. No `tabs.hide`, no Zen internals.
- All state in `storage.local`; nothing the sweep relies on is kept only in memory (MV3 service worker).
- Defaults: Auto-close on, idle hours 12 (range 1–720), trash size 200 (range 10–1000), check every 5 minutes.
- Never closed: `pinned`, `active`, `audible`, `incognito` tabs.
- `clockStart` set only on first install and on Auto-close off→on. Never on startup, update or worker restart.
- Sweep immediately on `runtime.onStartup`; idle time carries across restarts.
- Dev-only minutes switch exists only when `import.meta.env.MODE === 'development'`.
- Popup: two tabs ("Swept · <count>" default, "Settings"), ~520px tall, follows `prefers-color-scheme`, system
  fonts, SVG icons, no emoji. Use the ui-ux-pro-max skill for the popup task.
- bun for everything (install, scripts, build, test). Scripts live in `package.json`.
- `minimum_chrome_version: "121"` (first Chrome with `tab.lastAccessed`).

## Review Focus

1. **A sweep and a popup action at the same moment** (restore while a sweep appends). Expected: no trash entry is
   lost or duplicated. Covered by the single background queue (Task 5) and pinned by the `exclusive` test.
2. **Tabs the trash can't reopen** (`about:`, `chrome://`, `file:`, extension pages). `tabs.create` refuses
   them, so closing them would lose them. Expected: they're never closed, except blank new-tab pages, which are
   closed without a trash entry because there's nothing to lose. Test in Task 3.
3. **Tabs with no `lastAccessed`** (some Chrome tabs mid-creation). Expected: treated as just viewed, never
   closed. Test in Task 3.
4. **Large `data:` favicons** filling the 10 MB `storage.local` quota at M=1000. Expected: only `http(s)`
   favicon URLs are stored; others are dropped and the popup shows a generic icon. Test in Task 4.
5. **Restoring an entry whose URL now fails to open.** Expected: that entry stays in the trash; the others are
   restored and removed. Covered in Task 5 (restore removes only the ids whose `tabs.create` succeeded).

---

## File Structure

```
mise.toml                     bun pin
package.json                  scripts
wxt.config.ts                 manifest (name, permissions, gecko id, min Chrome)
web-ext.config.example.ts     committed template for browser binary paths
web-ext.config.ts             git-ignored, per machine
renovate.json
lib/settings.ts               Settings type, defaults, normalize, idle duration
lib/select.ts                 which tabs to close (pure)
lib/trash.ts                  trash entries: push/trim/remove/filter/group (pure)
lib/queue.ts                  exclusive(): serialize async work
lib/store.ts                  storage.local read/write (thin, untested)
lib/messages.ts               popup → background message types
entrypoints/background.ts     alarms, startup, install, messages, sweep, restore
entrypoints/popup/index.html
entrypoints/popup/main.ts
entrypoints/popup/style.css
tests/*.test.ts
```

---

### Task 1: Scaffold, plus the Essentials and restart checkpoint

**Files:**
- Create: `mise.toml`, `package.json`, `wxt.config.ts`, `web-ext.config.example.ts`, `renovate.json`, `.gitignore`,
  `entrypoints/background.ts` (temporary), `entrypoints/popup/*` (template placeholder)

**Interfaces:**
- Produces: working `bun run dev`, `dev:chromium`, `dev:brave`, `dev:zen`, `build`, `build:firefox`, `zip`,
  `zip:firefox`, `check`, `test` scripts.

- [ ] **Step 1: Pin bun and scaffold**

`mise.toml` → `[tools] bun = "latest"` resolved to a concrete version (`mise use bun@<current>`).
Run `bunx wxt@latest init . --template vanilla --pm bun`. If it refuses the non-empty directory, init into a temp
directory and copy everything except `.git` in. Delete the template's demo content (counter, logos).

- [ ] **Step 2: Configure `wxt.config.ts`**

```ts
manifest: {
  name: 'Tab Sweeper',
  description: 'Closes tabs you have not looked at in a while. Keeps pinned tabs and Zen Essentials.',
  permissions: ['tabs', 'storage', 'alarms'],
  minimum_chrome_version: '121',
  browser_specific_settings: {
    gecko: { id: '{<generate one UUID once>}', data_collection_permissions: { required: ['none'] } },
  },
}
```

- [ ] **Step 3: Scripts in `package.json`**

`dev: wxt`, `dev:chromium: wxt -b chromium`, `dev:brave: wxt -b brave`, `dev:zen: wxt -b firefox`,
`build: wxt build`, `build:firefox: wxt build -b firefox`, `zip: wxt zip`, `zip:firefox: wxt zip -b firefox`,
`check: wxt prepare && tsc --noEmit`, `test: bun test`.

`web-ext.config.example.ts`:
```ts
import { defineWebExtConfig } from 'wxt';
export default defineWebExtConfig({
  binaries: { chromium: '/usr/bin/chromium', brave: '/usr/bin/brave', firefox: '/usr/bin/zen-browser' },
});
```
Add `web-ext.config.ts` and `.output/` to `.gitignore`.

- [ ] **Step 4: `renovate.json` in the precedent shape**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "vulnerabilityAlerts": { "enabled": true },
  "packageRules": [
    { "matchUpdateTypes": ["minor", "patch", "pin", "digest"], "groupName": "all non-major dependencies",
      "groupSlug": "all-minor-patch" }
  ]
}
```
(No Docker here; mise's `bun` pin is handled by Renovate's built-in `mise` manager, so no custom manager is needed.)

- [ ] **Step 5: Temporary diagnostic background**

`entrypoints/background.ts` logs, on install and on startup:
`(await browser.tabs.query({})).map(t => ({ title: t.title, pinned: t.pinned, hidden: t.hidden, lastAccessed: t.lastAccessed }))`.
Task 5 replaces this file.

- [ ] **Step 6: Verify the build**

Run: `bun install && bun run check && bun run build && bun run build:firefox`
Expected: exit 0; `.output/chrome-mv3/manifest.json` lists exactly `tabs`, `storage`, `alarms`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold WXT project"
```

- [ ] **Step 8: HUMAN CHECKPOINT (author runs this; stop until answered)**

1. **Zen Essentials:** `bun run build:firefox`, then in Zen go to `about:debugging` → This Firefox → Load Temporary
   Add-on, and pick `.output/firefox-mv2/manifest.json`. Have at least one Essential, one workspace-pinned tab, and
   one tab in another workspace. Click Inspect and read the logged list. **Pass:** Essentials and pinned tabs
   show `pinned: true`.
2. **Restart, Chromium family:** in Chrome, Chromium and Brave, use Load unpacked on `.output/chrome-mv3`, note
   the `lastAccessed` of two old tabs, restart, and compare with the startup log. **Pass:** the values are
   unchanged.
3. **Restart, Zen:** a temporary add-on doesn't survive a restart. Use the Browser Console instead (enable
   `devtools.chrome.enabled`): run `gBrowser.tabs.map(t => [t.label, t.lastAccessed])` before and after the
   restart. **Pass:** the values are unchanged.

If 1 fails: **stop the plan** and go back to the author (spec: no pre-approved fallback).
If 2 or 3 fails for a browser: do Task 7 for that browser after Task 5.

---

### Task 2: Settings

**Files:**
- Create: `lib/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces:
  - `interface Settings { enabled: boolean; idleHours: number; trashSize: number; devMinutes: boolean }`
  - `const DEFAULT_SETTINGS: Settings` = `{ enabled: true, idleHours: 12, trashSize: 200, devMinutes: false }`
  - `normalizeSettings(raw: unknown): Settings`
  - `idleMs(s: Settings, isDev: boolean): number`
  - `sweepPeriodMinutes(s: Settings, isDev: boolean): number`

- [ ] **Step 1: Write the failing tests**

```ts
test('defaults when storage is empty', () => expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS));
test('clamps idle hours to 1..720 and rounds', () => {
  expect(normalizeSettings({ idleHours: 0 }).idleHours).toBe(1);
  expect(normalizeSettings({ idleHours: 9999 }).idleHours).toBe(720);
  expect(normalizeSettings({ idleHours: 2.6 }).idleHours).toBe(3);
  expect(normalizeSettings({ idleHours: 'abc' }).idleHours).toBe(12);
});
test('clamps trash size to 10..1000', () => {
  expect(normalizeSettings({ trashSize: 1 }).trashSize).toBe(10);
  expect(normalizeSettings({ trashSize: 5000 }).trashSize).toBe(1000);
});
test('idle duration: hours normally, minutes only in dev with the switch on', () => {
  const s = { ...DEFAULT_SETTINGS, idleHours: 2, devMinutes: true };
  expect(idleMs(s, false)).toBe(2 * 3_600_000);
  expect(idleMs(s, true)).toBe(2 * 60_000);
  expect(idleMs({ ...s, devMinutes: false }, true)).toBe(2 * 3_600_000);
});
test('sweep period 5 min, 1 min in dev minutes mode', () => {
  expect(sweepPeriodMinutes(DEFAULT_SETTINGS, false)).toBe(5);
  expect(sweepPeriodMinutes({ ...DEFAULT_SETTINGS, devMinutes: true }, true)).toBe(1);
});
```

- [ ] **Step 2: Run, expect FAIL** — `bun test tests/settings.test.ts` → module not found.
- [ ] **Step 3: Implement `lib/settings.ts`.** Non-numeric values fall back to the default. No imports from `wxt`.
- [ ] **Step 4: Run, expect PASS** — `bun test tests/settings.test.ts`.
- [ ] **Step 5: Commit** — `git commit -am "feat: settings normalization"` (add new files first).

---

### Task 3: Tab selection

**Files:**
- Create: `lib/select.ts`
- Test: `tests/select.test.ts`

**Interfaces:**
- Produces:
  - `interface TabLike { id?: number; url?: string; pinned: boolean; active: boolean; audible?: boolean; incognito: boolean; lastAccessed?: number }`
  - `isBlankTab(url?: string): boolean`: true for `about:blank`, `about:newtab`, `about:home`, `chrome://newtab/`.
  - `isRestorable(url?: string): boolean`: true only for `http:` and `https:`.
  - `selectTabsToClose<T extends TabLike>(tabs: T[], now: number, idleMs: number, clockStart: number): T[]`

- [ ] **Step 1: Write the failing tests**

Helper: `const tab = (o: Partial<TabLike>): TabLike => ({ id: 1, url: 'https://a.test', pinned: false, active: false, audible: false, incognito: false, lastAccessed: 0, ...o })`. Use `H = 3_600_000`, `now = 100 * H`, `idle = 12 * H`, `clockStart = 0`.

```ts
test('closes a tab idle longer than N', () => expect(sel([tab({ lastAccessed: now - 13 * H })])).toHaveLength(1));
test('keeps a tab idle exactly N or less', () => expect(sel([tab({ lastAccessed: now - 12 * H })])).toHaveLength(0));
test.each(['pinned', 'active', 'audible', 'incognito'])('never closes %s tabs', (k) =>
  expect(sel([tab({ [k]: true, lastAccessed: 0 })])).toHaveLength(0));
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
  for (const url of ['about:blank', 'about:newtab', 'chrome://newtab/']) expect(sel([tab({ url })])).toHaveLength(1);
});
test('hidden tabs (other Zen workspaces) are not exempt', () =>
  expect(sel([{ ...tab({}), hidden: true } as TabLike])).toHaveLength(1));
```
(`sel = (t) => selectTabsToClose(t, now, idle, clockStart)`.)

- [ ] **Step 2: Run, expect FAIL** — `bun test tests/select.test.ts`.
- [ ] **Step 3: Implement `lib/select.ts`.** Idle is `now - Math.max(lastAccessed, clockStart) > idleMs`, strictly greater.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `"feat: idle tab selection"`.

---

### Task 4: Trash operations

**Files:**
- Create: `lib/trash.ts`
- Test: `tests/trash.test.ts`

**Interfaces:**
- Produces:
  - `interface TrashEntry { id: string; url: string; title: string; favIconUrl?: string; closedAt: number }`
  - `toEntry(tab: { url: string; title?: string; favIconUrl?: string }, closedAt: number, id: string): TrashEntry`:
    empty title → url; keeps `favIconUrl` only if it starts with `http:` or `https:`.
  - `pushEntries(trash: TrashEntry[], added: TrashEntry[], max: number): TrashEntry[]`: newest first, capped.
  - `trimTrash(trash: TrashEntry[], max: number): TrashEntry[]`
  - `removeEntries(trash: TrashEntry[], ids: string[]): TrashEntry[]`
  - `filterTrash(trash: TrashEntry[], query: string): TrashEntry[]`
  - `groupByDay(trash: TrashEntry[], now: number, locale?: string): { label: string; entries: TrashEntry[] }[]`

- [ ] **Step 1: Write the failing tests**

```ts
test('push puts new entries first and drops the oldest past max', () => {
  const old = [e('a', 3), e('b', 2), e('c', 1)];
  expect(pushEntries(old, [e('n', 4)], 3).map(x => x.id)).toEqual(['n', 'a', 'b']);
});
test('trim keeps the newest max', () => expect(trimTrash([e('a', 3), e('b', 2), e('c', 1)], 2).map(x => x.id)).toEqual(['a', 'b']));
test('remove by id', () => expect(removeEntries([e('a', 1), e('b', 2)], ['a']).map(x => x.id)).toEqual(['b']));
test('filter matches title or url, case-insensitive; blank query returns all', () => {
  const t = [{ ...e('a', 1), title: 'Zen Docs', url: 'https://zen.test' }, { ...e('b', 1), title: 'Other', url: 'https://x.test/ZEN' }, e('c', 1)];
  expect(filterTrash(t, 'zen').map(x => x.id)).toEqual(['a', 'b']);
  expect(filterTrash(t, '   ')).toHaveLength(3);
});
test('toEntry drops data: favicons and falls back to url for empty titles', () => {
  const x = toEntry({ url: 'https://a.test', title: '', favIconUrl: 'data:image/png;base64,AAA' }, 5, 'id');
  expect(x).toEqual({ id: 'id', url: 'https://a.test', title: 'https://a.test', favIconUrl: undefined, closedAt: 5 });
});
test('groups by local day with Today/Yesterday/date labels', () => {
  const now = new Date(2026, 10, 10, 14, 0).getTime();
  const g = groupByDay([at(2026, 10, 10, 9), at(2026, 10, 9, 23), at(2026, 10, 8, 10)], now, 'en-GB');
  expect(g.map(x => x.label)).toEqual(['Today', 'Yesterday', 'Sun 8 Nov']);
});
```
(`e(id, closedAt)` builds an entry; `at(y, m, d, h)` builds one with `closedAt = new Date(y, m, d, h).getTime()`.
Date labels use `toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })`; assert
whatever string that yields for `en-GB` in bun if it differs in punctuation.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `lib/trash.ts`.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `"feat: trash operations"`.

---

### Task 5: Background: sweep, schedule, messages

**Files:**
- Create: `lib/queue.ts`, `lib/store.ts`, `lib/messages.ts`, `tests/queue.test.ts`
- Replace: `entrypoints/background.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `exclusive<T>(fn: () => Promise<T>): Promise<T>` in `lib/queue.ts`: runs calls one at a time in call order; a
    rejection doesn't block later calls.
  - `lib/store.ts`: `getSettings(): Promise<Settings>`, `setSettings(s: Settings)`, `getTrash(): Promise<TrashEntry[]>`,
    `setTrash(t)`, `getClockStart(): Promise<number>` (0 if unset), `setClockStart(n)`,
    `getLastSweep(): Promise<{ at: number; closed: number } | undefined>`, `setLastSweep(v)`.
    Storage keys: `settings`, `trash`, `clockStart`, `lastSweep`.
  - `lib/messages.ts`: `type Message = { type: 'restore'; ids: string[] } | { type: 'clear' } | { type: 'setSettings'; patch: Partial<Settings> }`.

- [ ] **Step 1: Failing test for `exclusive`**

```ts
test('runs one at a time in call order, survives rejection', async () => {
  const log: string[] = [];
  const slow = (n: string, ms: number) => () => new Promise<void>(r => setTimeout(() => { log.push(n); r(); }, ms));
  const a = exclusive(slow('a', 20)); const b = exclusive(() => Promise.reject(new Error('x'))); const c = exclusive(slow('c', 1));
  await a; await b.catch(() => {}); await c;
  expect(log).toEqual(['a', 'c']);
});
```

- [ ] **Step 2: Run, expect FAIL; implement `lib/queue.ts`; run, expect PASS.**

- [ ] **Step 3: Implement `lib/store.ts` and `lib/messages.ts`.** `getSettings` passes the raw value through `normalizeSettings`.

- [ ] **Step 4: Implement `entrypoints/background.ts`.** Every handler below runs inside `exclusive`. `isDev = import.meta.env.MODE === 'development'`.
  - `runtime.onInstalled`: if `reason === 'install'`, `setClockStart(Date.now())`.
  - At top level (every worker start): ensure alarm `sweep` exists with `periodInMinutes = sweepPeriodMinutes(settings, isDev)`; recreate it if the period differs.
  - `runtime.onStartup`: `sweep()` now, plus a one-shot alarm `startup-sweep` with `delayInMinutes: 1` to catch tabs that session restore creates late.
  - `alarms.onAlarm` (`sweep` or `startup-sweep`): `sweep()`.
  - `sweep()`: return if `!settings.enabled`. `tabs.query({ windowType: 'normal' })` → `selectTabsToClose(tabs, Date.now(), idleMs(settings, isDev), clockStart)`. Build entries for the `isRestorable` ones (`crypto.randomUUID()` ids), **write the trash first** (`pushEntries`, capped at `trashSize`), then `tabs.remove(ids)`, then `setLastSweep({ at, closed })`.
  - `runtime.onMessage`:
    - `restore`: for each id, `tabs.create({ url, active: ids.length === 1 })`; remove from the trash only the ids whose create resolved.
    - `clear`: `setTrash([])`.
    - `setSettings`: merge the patch, normalize, save. If `enabled` went false→true, `setClockStart(Date.now())`. If `trashSize` dropped, `trimTrash`. If `devMinutes` changed, recreate the `sweep` alarm.

- [ ] **Step 5: Verify**

Run: `bun run check && bun test`. Expected: all pass.
Manual: `bun run dev`, open the service worker console, and send
`browser.runtime.sendMessage({ type: 'setSettings', patch: { devMinutes: true, idleHours: 1 } })` from the popup's
devtools console (open the popup, right-click → Inspect); the worker can't message itself. Open 4 tabs: a pinned one, one playing audio, one active, one plain. After about
2 minutes only the plain tab is closed, and `storage.local.get('trash')` shows it.

- [ ] **Step 6: Commit** — `"feat: background sweep, schedule and messages"`.

---

### Task 6: Popup (use ui-ux-pro-max)

**Files:**
- Replace: `entrypoints/popup/index.html`, `entrypoints/popup/main.ts`, `entrypoints/popup/style.css`

**Interfaces:**
- Consumes: `lib/store.ts` getters (read-only), `Message`, `filterTrash`, `groupByDay`, `DEFAULT_SETTINGS`.
- The popup never writes storage itself. It sends `Message`s and re-renders on `storage.onChanged`.

- [ ] **Step 1: Build the popup to match the approved mockups** (layout B; `docs/superpowers/mockups/popup-scroll.html` and `popup-settings.html` are the approved look, open them in a browser; the spec's Interface section is authoritative where they differ):
  - Width 340px, height 520px. Tab strip and search fixed at the top, footer fixed at the bottom, only the list scrolls (`flex` column, `overflow-y: auto` on the list), sticky day headings.
  - Swept tab: tab label `Swept · ${trash.length}`; search filters live via `filterTrash`; rows show favicon (generic SVG globe when absent or failing to load), single-line ellipsised title (with the URL in `title=`), and the time `HH:MM`. A click sends `restore [id]`. Footer: "Restore all" (`restore` with all ids) and "Clear" (`clear`, with an inline "Clear N tabs? Yes / No" confirmation instead of `confirm()`, which is blocked in popups). Empty state: "Nothing swept yet."
  - Settings tab:
    1. Auto-close switch (`role="switch"`, labelled), with the help text "Checks every 5 minutes".
    2. "Close tabs idle for" stepper: −/+ buttons and a typed number input, `min=1 max=720`, unit "h". Saved on change/blur via `setSettings`.
    3. "Never closed" list: "Pinned tabs and Essentials", "The tab you're looking at in each window", "Tabs playing sound".
    4. "Keep in trash" number input, `min=10 max=1000`, with the help text "Survives restarts. Oldest drop off first."
    5. Dev only (`import.meta.env.MODE === 'development'`): checkbox "Count idle time in minutes (dev build)".
    6. Footer: "Last sweep HH:MM · closed K", or "No sweep yet".
  - Colors from CSS variables with light and dark sets via `prefers-color-scheme`. Visible focus rings, all controls keyboard-operable, text contrast ≥ 4.5:1, honors `prefers-reduced-motion`.

- [ ] **Step 2: Verify**

Run: `bun run check && bun test && bun run build && bun run build:firefox`. Expected: all pass.
Manual in `bun run dev` (dev minutes on, N=1): a closed tab appears under "Today". Search narrows the list. A row
click reopens the tab and removes the row. Clear asks for confirmation first. Lowering "Keep in trash" below the
count trims the list immediately. Check both light and dark mode.

- [ ] **Step 3: Commit** — `"feat: popup with swept list and settings"`.

---

### Task 7 (conditional): Own last-seen tracking

Do this **only** for browsers that failed checkpoint 2 or 3 in Task 1. Otherwise skip it and note "not needed" in
the final report.

- Store `lastSeen: { [url: string]: number }` in `storage.local`. Update it on `tabs.onActivated` (for the URL of
  the tab being left and of the tab activated), and before each sweep for every tab whose `lastAccessed` is
  older than its record.
- In `sweep()`, map each tab's `lastAccessed` to `lastSeen[url] ?? tab.lastAccessed` before `selectTabsToClose`
  (the record is kept current by `onActivated`, so it is never older than a real view).
- Prune `lastSeen` keys with no open tab after each sweep.
- Add `tests/lastSeen.test.ts` for the pure merge/prune helpers; re-run checkpoint 2/3 for that browser.

---

### Task 8: Release check

- [ ] **Step 1:** `bun run zip && bun run zip:firefox`. Expected: zips in `.output/`. The Firefox sources zip
  contains no `web-ext.config.ts`.
- [ ] **Step 2:** Inspect both built manifests: permissions are exactly `tabs, storage, alarms`, there's no
  `incognito` key, `minimum_chrome_version` is `121`, and the gecko id and `data_collection_permissions` are
  present.
- [ ] **Step 3: Manual matrix**, in Zen, Chrome, Chromium and Brave, using real profiles (Load unpacked or a
  temporary add-on):
  - Pinned tabs and Essentials survive.
  - The active tab and an audible tab survive.
  - A tab in another Zen workspace gets swept.
  - The trash restores into the current workspace.
- [ ] **Step 4:** Replace the template icons with Tab Sweeper icons (16/32/48/128 PNG in `public/icon/`).
  Commit: `"chore: icons and release check"`.
