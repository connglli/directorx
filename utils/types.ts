/** Extract from A properties of B, or use b as default */
export function extract<A, B>(a: A, b: B): B {
  for (const k in b) {
    b[k] = (a as any)[k] ?? b[k];
  }
  return b;
}
