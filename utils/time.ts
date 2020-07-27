export function now(): number {
  return new Date().getTime();
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

export function timeOf<R>(
  /* eslint-disable */
  fn: (...args: any[]) => R,
  ...args: any[]
): [number, R] {
  const st = now();
  const r = fn(...args);
  const ed = now();
  return [ed - st, r];
}
