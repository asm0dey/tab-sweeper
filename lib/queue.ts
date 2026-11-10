let tail: Promise<unknown> = Promise.resolve();

/** Runs async work one call at a time, in call order. A rejection does not block later calls. */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}
