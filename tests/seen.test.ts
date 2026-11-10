import { expect, test } from 'bun:test';
import { EMPTY_SEEN, noteActivation, noteSweep } from '../lib/seen';

test('activation stamps the tab that was active in that window', () => {
  let s = noteActivation(EMPTY_SEEN, 1, 10, 100);
  s = noteActivation(s, 1, 11, 500);
  expect(s.lastSeen['10']).toBe(500);
  expect(s.activeByWindow['1']).toBe(11);
});

test('activation in another window does not stamp this window', () => {
  let s = noteActivation(EMPTY_SEEN, 1, 10, 100);
  s = noteActivation(s, 2, 20, 500);
  expect(s.lastSeen['10']).toBeUndefined();
});

test('sweep stamps active tabs, records them per window, prunes closed tabs', () => {
  const s = noteSweep(
    { activeByWindow: {}, lastSeen: { '99': 1, '10': 2 } },
    [
      { id: 10, windowId: 1, active: false },
      { id: 11, windowId: 1, active: true },
    ],
    700,
  );
  expect(s.lastSeen).toEqual({ '10': 2, '11': 700 });
  expect(s.activeByWindow).toEqual({ '1': 11 });
});
