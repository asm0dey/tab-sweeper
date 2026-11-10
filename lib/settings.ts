export interface Settings {
  enabled: boolean;
  idleHours: number;
  trashSize: number;
  /** Dev builds only: count idleHours as minutes. */
  devMinutes: boolean;
}

export const DEFAULT_SETTINGS: Settings = { enabled: true, idleHours: 12, trashSize: 200, devMinutes: false };

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    enabled: bool(r.enabled, d.enabled),
    idleHours: clampInt(r.idleHours, 1, 720, d.idleHours),
    trashSize: clampInt(r.trashSize, 10, 1000, d.trashSize),
    devMinutes: bool(r.devMinutes, d.devMinutes),
  };
}

const minutesMode = (s: Settings, isDev: boolean) => isDev && s.devMinutes;

export const idleMs = (s: Settings, isDev: boolean): number =>
  s.idleHours * (minutesMode(s, isDev) ? 60_000 : 3_600_000);

export const sweepPeriodMinutes = (s: Settings, isDev: boolean): number => (minutesMode(s, isDev) ? 1 : 5);
