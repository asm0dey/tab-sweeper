import { expect, test } from 'bun:test';
import { exclusive } from '../lib/queue';

test('runs one at a time in call order, survives rejection', async () => {
  const log: string[] = [];
  const slow = (n: string, ms: number) => () =>
    new Promise<void>((r) =>
      setTimeout(() => {
        log.push(n);
        r();
      }, ms),
    );
  const a = exclusive(slow('a', 20));
  const b = exclusive(() => Promise.reject(new Error('x')));
  const c = exclusive(slow('c', 1));
  await a;
  await expect(b).rejects.toThrow('x');
  await c;
  expect(log).toEqual(['a', 'c']);
});

test('returns the value of the wrapped call', async () => expect(await exclusive(async () => 42)).toBe(42));
