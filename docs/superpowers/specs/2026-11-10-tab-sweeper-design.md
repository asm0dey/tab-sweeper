# Tab Sweeper — design

Date: 2026-11-10. Status: draft, pending author approval.

## Intent

A browser extension that closes tabs the user has not looked at for more than N hours, so the tab bar stays clean
without manual pruning. The author uses Zen (Firefox-based) and a Chrome-based browser, and wants to share the
extension with others through the browser add-on stores.

The goal is less clutter, not lower memory use (unloading/discarding tabs is not what this is).

## Goals

- Close any tab idle longer than N hours, where N is one global setting for the whole add-on.
- Never close pinned tabs. In Zen this must also cover Essentials and per-workspace pinned tabs.
- Tabs in Zen workspaces the user hasn't opened age out exactly like any other tab (author's decision). Only
  pinned tabs and Essentials are exempt.
- Keep a trash bin with the last M auto-closed tabs (M configurable, default 200) so the user can reopen any of them. Firefox's own
  recently-closed list holds only 25, which is too few for a sweep.
- Work in Zen/Firefox and Chrome-based browsers from one codebase, and be publishable to both add-on stores.

## Non-goals

- Per-site rules, allowlists, or per-tab overrides. N is add-on-global (author's decision).
- A "sweep now" button. It was considered and dropped because the periodic check already runs every 5 minutes.
- Restoring a tab into its original Zen workspace, or with its back/forward history.
- Syncing settings or trash between devices.

## Anti-goals (failure even if it "works")

- Closing a pinned tab or an Essential.
- Closing the tab the user is currently looking at.
- Losing a closed tab with no way to reopen it, while it is still among the last M.

## Behavior

### Sweep

- Runs on a periodic alarm every 5 minutes, and only while the "Auto-close" switch is on.
- **Also runs once immediately on browser start** (`runtime.onStartup`), after session restore has created the
  tabs (author's decision). Idle time carries over across restarts: a restart does **not** reset any tab's clock.
  So after a weekend away with N=12h, Friday's unpinned tabs close as soon as the browser opens.
- Candidate tabs: every tab in every normal, non-private window where
  `now - max(tab.lastAccessed, clockStart) > N hours`.
- **Fresh clock, install and re-enable only (author's decision):** `clockStart` is a stored timestamp, set on
  first install (`runtime.onInstalled` with reason `install`) and whenever the Auto-close switch is turned on.
  Tabs already idle at that moment get a full N hours, so installing from the store doesn't mass-close.
  It is **not** set on browser start, on update, or on a Chrome service-worker restart.
- **Restart timestamps (verify first, Claude's call):** check in Zen, Chrome, Chromium and Brave that restored
  tabs keep their pre-restart `lastAccessed`. Where a browser resets it, the extension keeps its own last-seen
  time per tab in `storage.local` (updated on `tabs.onActivated` and on each sweep) and, after restart, matches
  restored tabs to those records by URL. Build this only for browsers that need it.
- Always skipped, even when idle:
  - `tab.pinned` (covers Essentials in Zen, see Constraints)
  - `tab.active` in its window (the tab on screen)
  - `tab.audible` (playing sound; a paused video is fair game)
- Private/incognito windows are ignored completely: never swept, never written to the trash (Claude's call, to keep
  private URLs off disk). The manifest does not request incognito access.
- Hidden tabs (`tab.hidden`, which is how Zen hides other workspaces' tabs) are **not** exempt.
- Each closed tab is appended to the trash before it is removed.
- The time and count of the last sweep are stored for the Settings footer.

### Trash bin

- Stores `{url, title, favIconUrl, closedAt}` for each auto-closed tab, newest first, capped at M (FIFO: the
  oldest drops off when a new one arrives). Lowering M trims the oldest entries immediately.
- Persists across browser restarts (`storage.local`).
- Only auto-closed tabs go in. Tabs the user closes by hand are not recorded.
- Restoring a row opens the URL in a new tab in the current window (in Zen that means the current workspace) and
  removes the row.
- "Restore all" reopens every entry and empties the trash. "Clear" empties it without reopening.

### Settings

- Auto-close: on/off switch. Default on.
- Close tabs idle for: hours stepper that also accepts typed input. Range 1–720, default 12.
- Trash size M: number input, range 10–1000, default 200 (author's request; range and default are Claude's call).
- Idle-hours changes take effect at the next 5-minute check.

## Interface (author chose layout B from mockups)

A toolbar popup with two tabs. Plain and minimal look that follows the browser's light/dark theme
(`prefers-color-scheme`), using system fonts and SVG icons, no emoji. Interface work uses the
ui-ux-pro-max skill (author's request).

**"Swept · <count>" tab (opens by default)**
- Search box at the top that filters by title and URL.
- List of trashed tabs: favicon, title (single line, ellipsised), close time. Grouped under day headings
  ("Today", "Yesterday", "Mon, 8 Nov"), which stick to the top while scrolling.
- Header and footer are fixed; only the list scrolls. The popup is about 520px tall (Firefox caps popups near
  600px), which fits roughly 15 rows.
- Footer: "Restore all", "Clear".
- Clicking a row restores that tab.

**"Settings" tab**
1. Auto-close switch, with the help text "Checks every 5 minutes".
2. "Close tabs idle for" hours stepper.
3. "Never closed" read-only list: pinned tabs and Essentials, the tab you're looking at in each window, tabs
   playing sound.
4. "Keep in trash" number input (M tabs), with the help text: survives restarts, oldest drop off first.
5. Footer: "Last sweep HH:MM · closed K".

Mockups from the session: `popup-layout.html`, `popup-scroll.html` and `popup-settings.html` (visual companion,
scratch only, not part of the repo).

## Approaches considered

| Approach | Trade-off | Outcome |
|---|---|---|
| **A. WXT + TypeScript + bun**, popup in plain TS/HTML (no UI framework) | One dependency and a build step. In return it builds the Firefox and Chrome variants, packages the store zips and hot-reloads during development | **Chosen** by the author. Sharing through two stores is exactly what WXT automates |
| B. Plain JS, no build, one hand-written manifest | Zero dependencies, but packaging, signing and browser differences are handled by hand on every release, and type checking would bring back a build step | Rejected |
| Plasmo | React-centric, which this small popup doesn't need, and less actively maintained than WXT | Dropped before presenting |

## Constraints

- **Essentials = pinned (verify first).** Zen implements Essentials on top of Firefox pinned tabs, so
  `tab.pinned` should be true for them. The extension API cannot tell an Essential apart from a pinned tab, but
  that doesn't matter here because both are skipped. This is the riskiest assumption: confirm it in Zen before
  building the rest, by pinning a tab, adding an Essential, and logging `tabs.query({})`. If Essentials or
  workspace-pinned tabs are **not** `pinned`, stop and go back to the author before building further
  (Claude's call; there is no pre-approved fallback).
- **Chromium targets:** Chrome, Chromium and Brave (the browsers the author uses). Test pinned-tab detection and
  the sweep in all three, plus Zen.
- **`lastAccessed`**: available in Firefox and in Chrome 121+. Whether it survives a browser restart is unverified;
  see "Restart timestamps" under Sweep.
- Use the `browser.*` API through WXT so the code stays cross-browser. No Firefox-only APIs (e.g. `tabs.hide`,
  Zen internals).
- Chrome MV3 background is a service worker, so it can't keep in-memory state: all state lives in `storage.local`,
  and the schedule uses the alarms API.
- Permissions: `tabs` (to read URL/title of other tabs), `storage`, `alarms`. Nothing else.
- Tooling, from the author's recorded precedents: bun for install/scripts/build/test, and a `renovate.json` from
  the start in the standard shape.

## Decided by the author

- N is a single add-on-global setting, tunable.
- Pinned tabs and Essentials are never closed.
- Tabs in other Zen workspaces age out like any other tab.
- Trash bin of the last M auto-closed tabs, M configurable.
- Popup layout B (two tabs: Swept, Settings) with sticky day headings.
- No "Sweep now" button.
- Support Zen/Firefox and Chrome-based browsers, shareable via the stores.
- Approach A: WXT + TypeScript + bun.
- Fresh clock only on first install and on re-enabling Auto-close; a browser restart keeps every tab's idle time.
- Sweep immediately on browser start.
- Chromium targets: Chrome, Chromium, Brave.

## Proposed by Claude (author may veto)

- Skip the active tab and audible tabs.
- 5-minute check interval; N range 1–720 h, default 12 h.
- Auto-close switch, default on.
- Search box, "Restore all" and "Clear" in the trash.
- Restore opens in the current window/workspace and removes the row.
- Manually closed tabs are not recorded in the trash.
- Name "Tab Sweeper".
- Trash size range 10–1000, default 200; lowering it trims immediately.
- Private windows ignored entirely.
- If Essentials aren't `pinned` in Zen: stop and ask, no fallback built in advance.
- If a browser resets `lastAccessed` on restore: track last-seen times ourselves, matched by URL.

## Left to the builder

- Project layout inside WXT, icon artwork, exact spacing/colors within the minimal theme.
- Test approach (unit-test the "which tabs to close" selection as a pure function; manually check Essentials and
  the restart behavior in Zen and Chrome).
- Store listing text and screenshots.
