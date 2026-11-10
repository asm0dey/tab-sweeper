export interface TabLike {
  id?: number;
  url?: string;
  pinned: boolean;
  active: boolean;
  audible?: boolean;
  incognito: boolean;
  lastAccessed?: number;
}

const BLANK = new Set(['about:blank', 'about:newtab', 'about:home', 'chrome://newtab/']);

/** Empty new-tab pages: safe to close without a trash entry. */
export const isBlankTab = (url?: string): boolean => url !== undefined && BLANK.has(url);

/** Only these can be reopened later with tabs.create. */
export const isRestorable = (url?: string): boolean => url !== undefined && /^https?:/i.test(url);

/**
 * lastSeen: tab id -> when the tab was last seen active. Chrome only stamps lastAccessed when a tab is
 * activated, so a tab used for hours and then left would otherwise look idle the moment it's left.
 */
export function selectTabsToClose<T extends TabLike>(
  tabs: T[],
  now: number,
  idleMs: number,
  clockStart: number,
  lastSeen: Record<string, number> = {},
): T[] {
  return tabs.filter(
    (t) =>
      t.id !== undefined &&
      !t.pinned &&
      !t.active &&
      !t.audible &&
      !t.incognito &&
      t.lastAccessed !== undefined &&
      (isRestorable(t.url) || isBlankTab(t.url)) &&
      now - Math.max(t.lastAccessed, clockStart, lastSeen[String(t.id)] ?? 0) > idleMs,
  );
}
