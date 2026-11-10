import { expect, test } from 'bun:test';
import { DEFAULT_SETTINGS, idleMs, normalizeSettings, sweepPeriodMinutes } from '../lib/settings';

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

test('non-boolean flags fall back to defaults', () => {
  expect(normalizeSettings({ enabled: 'no', devMinutes: 1 })).toMatchObject({ enabled: true, devMinutes: false });
  expect(normalizeSettings({ enabled: false }).enabled).toBe(false);
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
  expect(sweepPeriodMinutes({ ...DEFAULT_SETTINGS, devMinutes: true }, false)).toBe(5);
});
