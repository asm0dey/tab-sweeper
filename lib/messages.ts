import type { Settings } from './settings';

export type Message =
  | { type: 'restore'; ids: string[] }
  | { type: 'clear' }
  | { type: 'setSettings'; patch: Partial<Settings> };
