export class PyalikeError extends Error {}

export function* zip<T, R>(a: T[], b: R[]): IterableIterator<[T, R]> {
  if (a.length != b.length) {
    throw new PyalikeError('Length is not equal');
  }
  for (let i = 0; i < a.length; i++) {
    yield [a[i], b[i]];
  }
}
