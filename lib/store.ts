import { browser } from 'wxt/browser';
import { EMPTY_SEEN, type SeenState } from './seen';
import { normalizeSettings, type Settings } from './settings';
import type { TrashEntry } from './trash';

export interface LastSweep {
  at: number;
  closed: number;
}

const local = () => browser.storage.local;
const get = async <T>(key: string): Promise<T | undefined> => (await local().get(key))[key] as T | undefined;

export const getSettings = async (): Promise<Settings> => normalizeSettings(await get('settings'));
export const setSettings = (settings: Settings) => local().set({ settings });

export const getTrash = async (): Promise<TrashEntry[]> => (await get<TrashEntry[]>('trash')) ?? [];
export const setTrash = (trash: TrashEntry[]) => local().set({ trash });

/** undefined means the clock was never started (install write missed or storage cleared). */
export const getClockStart = (): Promise<number | undefined> => get<number>('clockStart');
export const setClockStart = (clockStart: number) => local().set({ clockStart });

export const getLastSweep = (): Promise<LastSweep | undefined> => get<LastSweep>('lastSweep');
export const setLastSweep = (lastSweep: LastSweep) => local().set({ lastSweep });

export const getSeen = async (): Promise<SeenState> => (await get<SeenState>('seen')) ?? EMPTY_SEEN;
export const setSeen = (seen: SeenState) => local().set({ seen });
