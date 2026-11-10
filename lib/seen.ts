/**
 * Tracks when each tab was last active. Chrome's tab.lastAccessed is only stamped when a tab becomes
 * active, not when the user leaves it, so we record the moment a tab stops being active ourselves.
 * Keys are tab/window ids as strings (storage-friendly); tab ids don't survive a browser restart.
 */
export interface SeenState {
  activeByWindow: Record<string, number>;
  lastSeen: Record<string, number>;
}

export const EMPTY_SEEN: SeenState = { activeByWindow: {}, lastSeen: {} };

export function noteActivation(s: SeenState, windowId: number, tabId: number, now: number): SeenState {
  const prev = s.activeByWindow[String(windowId)];
  const lastSeen = prev !== undefined && prev !== tabId ? { ...s.lastSeen, [String(prev)]: now } : s.lastSeen;
  return { activeByWindow: { ...s.activeByWindow, [String(windowId)]: tabId }, lastSeen };
}

export function noteSweep(
  s: SeenState,
  tabs: { id?: number; windowId?: number; active: boolean }[],
  now: number,
): SeenState {
  const live = new Set(tabs.map((t) => String(t.id)));
  const lastSeen = Object.fromEntries(Object.entries(s.lastSeen).filter(([id]) => live.has(id)));
  const activeByWindow: Record<string, number> = {};
  for (const t of tabs) {
    if (!t.active || t.id === undefined) continue;
    lastSeen[String(t.id)] = now;
    if (t.windowId !== undefined) activeByWindow[String(t.windowId)] = t.id;
  }
  return { activeByWindow, lastSeen };
}
