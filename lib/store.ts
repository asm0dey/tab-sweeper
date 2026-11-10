import { browser } from 'wxt/browser';
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

export const getClockStart = async (): Promise<number> => (await get<number>('clockStart')) ?? 0;
export const setClockStart = (clockStart: number) => local().set({ clockStart });

export const getLastSweep = (): Promise<LastSweep | undefined> => get<LastSweep>('lastSweep');
export const setLastSweep = (lastSweep: LastSweep) => local().set({ lastSweep });
