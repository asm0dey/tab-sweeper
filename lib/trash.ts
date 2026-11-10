export interface TrashEntry {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  closedAt: number;
}

export function toEntry(tab: { url: string; title?: string; favIconUrl?: string }, closedAt: number, id: string): TrashEntry {
  return {
    id,
    url: tab.url,
    title: tab.title || tab.url,
    // data: favicons can be large; 1000 of them would strain the storage.local quota.
    favIconUrl: tab.favIconUrl && /^https?:/i.test(tab.favIconUrl) ? tab.favIconUrl : undefined,
    closedAt,
  };
}

export const trimTrash = (trash: TrashEntry[], max: number): TrashEntry[] => trash.slice(0, max);

export const pushEntries = (trash: TrashEntry[], added: TrashEntry[], max: number): TrashEntry[] =>
  trimTrash([...added, ...trash], max);

export const removeEntries = (trash: TrashEntry[], ids: string[]): TrashEntry[] => {
  const drop = new Set(ids);
  return trash.filter((e) => !drop.has(e.id));
};

export function filterTrash(trash: TrashEntry[], query: string): TrashEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return trash;
  return trash.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
}

const dayStart = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/** Assumes trash is newest first, as pushEntries keeps it. */
export function groupByDay(trash: TrashEntry[], now: number, locale?: string): { label: string; entries: TrashEntry[] }[] {
  const today = dayStart(now);
  const yesterday = new Date(today).setDate(new Date(today).getDate() - 1);
  const groups: { day: number; label: string; entries: TrashEntry[] }[] = [];
  for (const e of trash) {
    const day = dayStart(e.closedAt);
    let g = groups.at(-1);
    if (!g || g.day !== day) {
      const label =
        day === today
          ? 'Today'
          : day === yesterday
            ? 'Yesterday'
            : new Date(day).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
      groups.push((g = { day, label, entries: [] }));
    }
    g.entries.push(e);
  }
  return groups.map(({ label, entries }) => ({ label, entries }));
}
